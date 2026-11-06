import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/reverse-website/route";

const request = (body: unknown) => new NextRequest("https://gitreverse.com/api/reverse-website", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});
test("website endpoint rejects arbitrary cache keys and unauthorized refreshes before generation", async () => {
  assert.equal((await POST(request({ siteSlug: "victim-com", targetUrl: "https://attacker.com" }))).status, 400);
  assert.equal((await POST(request({ siteSlug: "victim-com", targetUrl: "https://victim.com", force: true }))).status, 403);
  for (const body of [null, [], { siteSlug: 1 }, { siteSlug: "victim-com", targetUrl: 1 }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
});
test("trusted writes use server-only credentials; public reads retain publishable access", () => {
  const client = readFileSync("lib/supabase.ts", "utf8");
  assert.match(client, /import "server-only"/);
  const promptRoute = readFileSync("app/api/reverse-prompt/route.ts", "utf8");
  assert.match(promptRoute, /const supabase = getSupabase\(\)/);
  assert.match(promptRoute, /const sb = getSupabaseAdmin\(\)/);
  for (const path of ["app/api/increment-views/route.ts", "app/api/admin/backfill-titles/route.ts", "app/api/admin/backfill-embeddings/route.ts"]) {
    const content = readFileSync(path, "utf8");
    assert.match(content, /getSupabaseAdmin\(\)/);
    assert.doesNotMatch(content, /getSupabase\(\)/);
  }
  const website = readFileSync("lib/website-reverse-storage.ts", "utf8");
  const writer = website.slice(website.indexOf("export async function writeWebsiteReverse"));
  assert.match(writer, /getSupabaseAdmin\(\)/);
  assert.doesNotMatch(writer, /\.upsert\(/);
  assert.match(writer, /existing.target_url !== opts.targetUrl/);
  assert.match(writer, /\.eq\("target_url", opts.targetUrl\)/);
});

test("website storage uses privileged credentials and refuses URL takeover without writing", async () => {
  const { writeWebsiteReverse } = await import("../lib/website-reverse-storage");
  const before = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://cache-security-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-server-only-key";
  const originalFetch = globalThis.fetch;
  let existing: { target_url: string } | null = null;
  const writes: string[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).hostname, "cache-security-test.invalid");
    assert.equal(request.headers.get("apikey"), "test-server-only-key");
    if (request.method === "GET") return Response.json(existing ? [existing] : []);
    writes.push(request.method);
    assert.notEqual(request.headers.get("prefer")?.includes("resolution=merge-duplicates"), true);
    if (request.method === "PATCH") {
      assert.equal(new URL(request.url).searchParams.get("target_url"), "eq.https://example.com/");
    }
    return new Response(null, { status: 204 });
  };
  try {
    const row = { slug: "example-com", targetUrl: "https://example.com/", prompt: "generated", designMd: "generated design" };
    await writeWebsiteReverse(row);
    assert.deepEqual(writes, ["POST"]);
    existing = { target_url: row.targetUrl };
    await writeWebsiteReverse(row);
    assert.deepEqual(writes, ["POST", "PATCH"]);
    await assert.rejects(writeWebsiteReverse({ ...row, targetUrl: "https://example-com.attacker.test/" }), /different URL/);
    assert.deepEqual(writes, ["POST", "PATCH"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (before.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = before.url;
    if (before.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = before.key;
  }
});
