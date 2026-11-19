import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { User } from "@supabase/supabase-js";
import { validateProject, projectZip } from "../lib/build-project/manifest";
import {
  BuildError,
  readJsonLimited,
  providerConfig,
  generateProject,
  reserveBuild,
  requireBuildUser,
  buildFailure,
} from "../lib/build-project/server";
import { exportProject } from "../lib/build-project/github";
import { POST as buildRoute } from "../app/api/build-project/route";
import { POST as githubRoute } from "../app/api/build-project/github/route";

const sample = {
  name: "sample-app",
  description: "Example",
  files: [
    { path: "README.md", content: "Review first." },
    {
      path: "app/page.tsx",
      content: "export default function Page(){return <h1>Hello</h1>}",
    },
  ],
};
const user = {
  id: "u1",
  identities: [{ provider: "github", identity_data: { sub: "123" } }],
} as unknown as User;
const token = "test-only-github-placeholder-token";
function env(values: Record<string, string | undefined>) {
  const old = Object.fromEntries(
    Object.keys(values).map((k) => [k, process.env[k]]),
  );
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
function mock(
  responses: unknown[],
  calls: { url: string; init?: RequestInit }[] = [],
): typeof fetch {
  return (async (url, init) => {
    calls.push({ url: String(url), init });
    const body = responses.shift();
    if (body instanceof Response) return body;
    if (body instanceof Error) throw body;
    assert.notEqual(body, undefined, "Unexpected request");
    return Response.json(body);
  }) as typeof fetch;
}
const goodProvider = {
  GITREVERSE_BUILD_PROVIDER: "openai",
  OPENAI_API_KEY: "test-provider-placeholder",
};

test("valid manifest, archive contents and UTF-8 roundtrip", () => {
  assert.deepEqual(validateProject(sample), sample);
  const dir = mkdtempSync(join(tmpdir(), "build-zip-"));
  try {
    const p = {
      ...sample,
      files: [...sample.files, { path: "notes.txt", content: "ሰላም\n☀" }],
    };
    writeFileSync(join(dir, "out.zip"), projectZip(p));
    execFileSync("python", [
      "-c",
      "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None; assert z.read('sample-app/notes.txt').decode()=='ሰላም\\n☀'; assert len(z.namelist())==3",
      join(dir, "out.zip"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
for (const path of [
  "../evil",
  "/tmp/evil",
  "foo/../evil",
  "C:/evil",
  "foo\\evil",
  "a//b",
  "a/%2e%2e/file",
  ".git/config",
  ".github/workflows/run.yml",
  "node_modules/x",
  ".env",
  "x/.env.local",
  "a/private.key",
  "NUL.txt",
  "x/foo. ",
  "foo\nbar",
]) {
  test(`rejects unsafe path ${JSON.stringify(path)}`, () =>
    assert.throws(() =>
      validateProject({
        ...sample,
        files: [...sample.files, { path, content: "x" }],
      }),
    ));
}
test("rejects case collisions, directory collisions, secrets, oversized projects", () => {
  for (const extra of [
    [{ path: "readme.md", content: "x" }],
    [{ path: "app", content: "x" }],
    [{ path: "secret.txt", content: "sk-proj-" + "x".repeat(30) }],
    [{ path: "binary", content: "\0" }],
  ])
    assert.throws(() =>
      validateProject({ ...sample, files: [...sample.files, ...extra] }),
    );
  assert.throws(() => validateProject({ ...sample, files: [] }));
  assert.throws(() =>
    validateProject({
      ...sample,
      files: [{ path: "README.md", content: "a".repeat(100001) }],
    }),
  );
});
test("only .env.example placeholders are allowed", () =>
  assert.doesNotThrow(() =>
    validateProject({
      ...sample,
      files: [
        ...sample.files,
        { path: ".env.example", content: "API_KEY=replace-me" },
      ],
    }),
  ));
test("limited JSON rejects content-length and streamed oversized bodies", async () => {
  await assert.rejects(() =>
    readJsonLimited(
      new Response("123", { headers: { "content-length": "1000" } }),
      4,
    ),
  );
  await assert.rejects(() => readJsonLimited(new Response('"123456"'), 4));
  await assert.rejects(() => readJsonLimited(new Response("invalid"), 100));
  assert.deepEqual(await readJsonLimited(Response.json({ x: 1 }), 100), {
    x: 1,
  });
});
test("provider pinned configuration and Azure deployment mapping", () => {
  const restore = env({ ...goodProvider });
  try {
    assert.equal(
      providerConfig().endpoint,
      "https://api.openai.com/v1/chat/completions",
    );
  } finally {
    restore();
  }
  const restoreAzure = env({
    GITREVERSE_BUILD_PROVIDER: "azure",
    AZURE_OPENAI_API_KEY: "test-only",
    AZURE_OPENAI_BASE_URL:
      "https://example.services.ai.azure.com/api/projects/demo/openai/v1",
    GITREVERSE_BUILD_MODEL: "gpt-5.4",
    AZURE_OPENAI_DEPLOYMENT_NAME_MAP: "gpt-5.4=gpt-5.4-mini",
  });
  try {
    assert.equal(providerConfig().model, "gpt-5.4-mini");
    process.env.AZURE_OPENAI_BASE_URL = "https://example.com/openai/v1";
    assert.throws(providerConfig);
  } finally {
    restoreAzure();
  }
});
test("generation is bounded JSON and never calls external command tools", async () => {
  const restore = env(goodProvider),
    calls: { url: string; init?: RequestInit }[] = [];
  try {
    const result = await generateProject(
      "Make a simple note taking application",
      undefined,
      mock(
        [
          {
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(sample) },
              },
            ],
          },
        ],
        calls,
      ),
    );
    assert.deepEqual(result, sample);
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.max_completion_tokens, 16000);
    assert.equal(body.tools, undefined);
    assert.equal(calls[0].init?.redirect, "error");
  } finally {
    restore();
  }
});
test("generation rejects truncated, malformed, unsafe or provider-error results without leaking body", async () => {
  const restore = env(goodProvider);
  try {
    for (const response of [
      { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
      {
        choices: [{ finish_reason: "stop", message: { content: "not JSON" } }],
      },
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                ...sample,
                files: [{ path: "../secret", content: "x" }],
              }),
            },
          },
        ],
      },
    ])
      await assert.rejects(() =>
        generateProject(
          "Make a simple note taking application",
          undefined,
          mock([response]),
        ),
      );
    await assert.rejects(
      () =>
        generateProject(
          "Make a simple note taking application",
          undefined,
          mock([new Response("secret upstream payload", { status: 500 })]),
        ),
      (e) => e instanceof Error && !e.message.includes("secret upstream"),
    );
  } finally {
    restore();
  }
});
test("preview concurrency and hourly limits", () => {
  const now = Date.now();
  const release = reserveBuild("limit-user", now);
  assert.throws(() => reserveBuild("limit-user", now));
  release();
  for (let i = 0; i < 4; i++) reserveBuild("limit-user", now)();
  assert.throws(() => reserveBuild("limit-user", now));
  reserveBuild("limit-user", now + 3600001)();
});
test("disabled routes do nothing", async () => {
  const restore = env({ GITREVERSE_BUILD_ENABLED: undefined });
  try {
    for (const handler of [buildRoute, githubRoute]) {
      const result = await handler(
        new Request("https://example.com/api/build-project", {
          method: "POST",
        }),
      );
      assert.equal(result.status, 404);
      assert.equal(result.headers.get("cache-control"), "no-store");
    }
  } finally {
    restore();
  }
});
test("strict auth rejects forged token even if it contains an allowlisted subject", async () => {
  const restore = env({
    GITREVERSE_BUILD_ENABLED: "true",
    GITREVERSE_BUILD_ALLOWED_USER_IDS: "u1",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "placeholder",
  });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = mock([
      new Response('{"error":"invalid JWT"}', { status: 401 }),
    ]);
    const forged = `e30.${Buffer.from('{"sub":"u1"}').toString("base64url")}.fake`;
    await assert.rejects(
      () =>
        requireBuildUser(
          new Request("https://example.com/api/build-project", {
            headers: {
              origin: "https://example.com",
              authorization: `Bearer ${forged}`,
            },
          }),
        ),
      (e) => e instanceof BuildError && e.status === 401,
    );
  } finally {
    globalThis.fetch = original;
    restore();
  }
});
test("strict auth denies no origin, cross-origin, missing token, empty allowlist", async () => {
  const restore = env({
    GITREVERSE_BUILD_ENABLED: "true",
    GITREVERSE_BUILD_ALLOWED_USER_IDS: "",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "placeholder",
  });
  const original = globalThis.fetch;
  try {
    for (const headers of [
      {},
      { origin: "https://evil.com" },
      { origin: "https://example.com" },
    ] as Record<string, string>[])
      await assert.rejects(() =>
        requireBuildUser(
          new Request("https://example.com/api/build-project", { headers }),
        ),
      );
    globalThis.fetch = mock([
      {
        id: "u1",
        identities: [],
        aud: "authenticated",
        email: "test@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01",
      },
    ]);
    await assert.rejects(
      () =>
        requireBuildUser(
          new Request("https://example.com/api/build-project", {
            headers: {
              origin: "https://example.com",
              authorization: "Bearer a.b.c",
            },
          }),
        ),
      (e) => e instanceof BuildError && e.status === 403,
    );
  } finally {
    globalThis.fetch = original;
    restore();
  }
});
test("GitHub export creates only a new private repo then verifies exact commit", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = mock(
    [
      { id: 123, login: "tester" },
      { private: true, full_name: "tester/new-app", default_branch: "main" },
      { object: { sha: "parent" } },
      { sha: "tree" },
      { sha: "commit" },
      { object: { sha: "commit" } },
      { object: { sha: "commit" } },
    ],
    calls,
  );
  assert.deepEqual(
    await exportProject(user, sample, token, "new-app", fetcher),
    { repositoryUrl: "https://github.com/tester/new-app", commit: "commit" },
  );
  assert.equal(JSON.parse(String(calls[1].init?.body)).private, true);
  assert.equal(JSON.parse(String(calls[5].init?.body)).force, false);
  assert.equal(calls.length, 7);
  assert.ok(
    calls.every(
      (c) =>
        c.url.startsWith("https://api.github.com/") &&
        c.init?.redirect === "error",
    ),
  );
});
test("GitHub identity mismatch blocks before mutation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  await assert.rejects(() =>
    exportProject(
      user,
      sample,
      token,
      "new-app",
      mock([{ id: 999, login: "other" }], calls),
    ),
  );
  assert.equal(calls.length, 1);
});
test("existing repo conflict cannot overwrite it", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  await assert.rejects(
    () =>
      exportProject(
        user,
        sample,
        token,
        "existing",
        mock(
          [
            { id: 123, login: "tester" },
            new Response("exists", { status: 422 }),
          ],
          calls,
        ),
      ),
    (e) => e instanceof BuildError && e.status === 409,
  );
  assert.equal(calls.length, 2);
});
test("partial/uncertain GitHub outcomes carry link and never retry", async () => {
  for (const failure of [
    new Response("bad", { status: 500 }),
    new Error("network"),
  ]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    await assert.rejects(
      () =>
        exportProject(
          user,
          sample,
          token,
          "new-app",
          mock(
            [
              { id: 123, login: "tester" },
              {
                private: true,
                full_name: "tester/new-app",
                default_branch: "main",
              },
              failure,
            ],
            calls,
          ),
        ),
      (e) =>
        e instanceof BuildError &&
        e.repositoryUrl === "https://github.com/tester/new-app",
    );
    assert.equal(calls.length, 3);
  }
});
test("unknown errors cannot leak secrets", async () => {
  const res = buildFailure(new Error("secret credential"));
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes("secret credential"));
});
test("Build is added only to existing action bars and normal login stays read-only", () => {
  for (const path of [
    "components/reverse-prompt-home.tsx",
    "components/website-reverse-page.tsx",
  ])
    assert.match(
      readFileSync(path, "utf8"),
      /<BuildProjectActions prompt=\{prompt\}/,
    );
  const auth = readFileSync("contexts/AuthContext.tsx", "utf8");
  assert.match(
    auth,
    /signInWithGitHub = useCallback\(\(\) => signInWithScopes\("read:user user:email"\)/,
  );
  assert.match(auth, /signInWithGitHubForExport/);
});

test("malformed successful mutation response is uncertain and links possible repository", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  await assert.rejects(
    () =>
      exportProject(
        user,
        sample,
        token,
        "new-app",
        mock(
          [
            { id: 123, login: "tester" },
            new Response("{truncated", { status: 201 }),
          ],
          calls,
        ),
      ),
    (e) =>
      e instanceof BuildError &&
      e.code === "github_uncertain" &&
      e.repositoryUrl === "https://github.com/tester/new-app" &&
      e.status === 502,
  );
  assert.equal(calls.length, 2);
});
test("build state is isolated between signed-in identities", () => {
  const source = readFileSync("components/build-project-actions.tsx", "utf8");
  assert.match(source, /user\?\.id \?\? "signed-out"/);
  assert.match(
    source,
    /alive.current\s*=\s*false;\s*controller.current\?\.abort/,
  );
});

test("missing GitHub mutation SHA never advances a ref or reports success", async () => {
  for (const afterParent of [[{}], [{ sha: "tree" }, {}]]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    await assert.rejects(
      () =>
        exportProject(
          user,
          sample,
          token,
          "new-app",
          mock(
            [
              { id: 123, login: "tester" },
              {
                private: true,
                full_name: "tester/new-app",
                default_branch: "main",
              },
              { object: { sha: "parent" } },
              ...afterParent,
            ],
            calls,
          ),
        ),
      (e) => e instanceof BuildError && e.code === "github_uncertain",
    );
    assert.ok(calls.every((c) => c.init?.method !== "PATCH"));
  }
});

test("unconfirmed repository creation never claims it was created", async () => {
  await assert.rejects(
    () =>
      exportProject(
        user,
        sample,
        token,
        "new-app",
        mock([
          { id: 123, login: "tester" },
          new Response("gateway timeout", { status: 502 }),
        ]),
      ),
    (e) =>
      e instanceof BuildError &&
      e.code === "github_uncertain" &&
      !e.message.includes("was created") &&
      !!e.repositoryUrl,
  );
});
