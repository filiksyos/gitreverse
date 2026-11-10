import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const moduleUrl = (file, replacements = []) => {
  let source = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
};
const helperUrl = moduleUrl("../lib/instagram-reel.ts");
const { parseInstagramReel, isInstagramMediaUrl } = await import(helperUrl);
const { POST } = await import(moduleUrl("../app/api/video-download/route.ts", [["@/lib/instagram-reel", helperUrl]]));
const request = (url) => new Request("http://localhost/api/video-download", { method: "POST", body: JSON.stringify({ url }) });

test("accepts reel share links and rejects misleading hosts and paths", () => {
  assert.equal(parseInstagramReel("https://www.instagram.com/reel/ABC_123-/?igsh=abc"), "ABC_123-");
  for (const url of ["https://instagram.com.evil.test/reel/abc/", "http://instagram.com/reel/abc/", "https://instagram.com/username/", "https://user@instagram.com/reel/abc/", "https://instagram.com:123/reel/abc/"]) assert.equal(parseInstagramReel(url), null);
  assert.equal(isInstagramMediaUrl("https://scontent.cdninstagram.com/video.mp4"), true);
  assert.equal(isInstagramMediaUrl("https://cdninstagram.com.evil.test/video.mp4"), false);
});

test("download route validates requests, handles provider failures, and delivers an MP4", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SEARCHAPI_API_KEY;
  try {
    assert.equal((await POST(request("https://evil.test/"))).status, 400);
    delete process.env.SEARCHAPI_API_KEY;
    assert.equal((await POST(request("https://instagram.com/reel/abc/"))).status, 503);
    process.env.SEARCHAPI_API_KEY = "test-key";
    globalThis.fetch = async () => Response.json({ error: "provider failed" }, { status: 429 });
    assert.equal((await POST(request("https://instagram.com/reel/abc/"))).status, 502);
    globalThis.fetch = async () => Response.json({ post: { type: "image", link: "https://scontent.cdninstagram.com/photo.jpg" } });
    assert.equal((await POST(request("https://instagram.com/reel/abc/"))).status, 422);
    globalThis.fetch = async () => Response.json({ post: { type: "reel", link: "https://localhost/video.mp4" } });
    assert.equal((await POST(request("https://instagram.com/reel/abc/"))).status, 502);
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      if (calls === 1) {
        assert.equal(new URL(url).searchParams.get("engine"), "instagram_post");
        assert.equal(options.headers.Authorization, "Bearer test-key");
        return Response.json({ post: { type: "reel", link: "https://scontent.cdninstagram.com/video.mp4" } });
      }
      assert.equal(options.redirect, "error");
      return new Response("mock-video", { headers: { "Content-Type": "video/mp4" } });
    };
    const response = await POST(request("https://instagram.com/reel/abc/"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="instagram-abc.mp4"');
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(await response.text(), "mock-video");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SEARCHAPI_API_KEY;
    else process.env.SEARCHAPI_API_KEY = originalKey;
  }
});
