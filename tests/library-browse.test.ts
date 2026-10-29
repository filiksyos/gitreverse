import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { browseLibrary, fetchInitialLibrary, searchLibrary } from "../lib/library-query";

const codeRow = {
  id: 1, owner: "example", repo: "code", title: "Code prompt",
  prompt: "Build an application", views: 10, cached_at: "2026-10-29T00:00:00Z",
};
const websiteRow = {
  slug: "website", target_url: "https://website.example", prompt: "Build a website",
  cached_at: "2026-10-28T00:00:00Z",
};

function rows(data: unknown[], total = data.length) {
  return Response.json(data, {
    headers: { "content-range": `0-${Math.max(0, data.length - 1)}/${total}` },
  });
}
function failure() {
  return Response.json({ code: "57014", message: "statement timeout" }, { status: 500 });
}
function client(handler: (url: URL, init?: RequestInit) => Response) {
  return createClient("https://database.example", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => handler(new URL(String(input)), init) },
  });
}

for (const sort of ["newest", "oldest", "trending"] as const) {
  test(`${sort} code browse avoids the exact-count timeout`, async () => {
    let calls = 0;
    const supabase = client((url, init) => {
      calls++;
      assert.ok(url.pathname.endsWith("/library_code_entries"));
      // Reproduces the production failure: exact count + page times out.
      if (new Headers(init?.headers).get("prefer")?.includes("count=exact")) return failure();
      assert.match(new Headers(init?.headers).get("prefer") ?? "", /count=planned/);
      assert.equal(url.searchParams.get("select"), "id,owner,repo,prompt,cached_at,views,title");
      assert.equal(url.searchParams.get("limit"), "24");
      assert.equal(url.searchParams.get("order"), sort === "trending"
        ? "views.desc,cached_at.desc" : `cached_at.${sort === "oldest" ? "asc" : "desc"}`);
      assert.equal(url.searchParams.has("cached_at"), sort === "trending");
      return rows([codeRow], 77107);
    });
    const result = await browseLibrary({ supabase, sort, page: 0, limit: 24, kind: "code" });
    assert.equal(result.data[0].kind, "code");
    assert.equal(result.total, 77107);
    assert.equal(result.totalIsEstimate, true);
    assert.equal(result.unavailableSources, undefined);
    assert.equal(calls, 1);
  });
}

test("initial Library browse returns both sources despite the exact-count timeout", async () => {
  const supabase = client((url, init) => {
    if (url.pathname.endsWith("/library_website_entries")) return rows([websiteRow], 12);
    if (new Headers(init?.headers).get("prefer")?.includes("count=exact")) return failure();
    return rows([codeRow], 77107);
  });
  const result = await fetchInitialLibrary(supabase, 24);
  assert.deepEqual(result.data.map(({ kind }) => kind), ["code", "website"]);
  assert.equal(result.total, 77119);
  assert.equal(result.totalIsEstimate, true);
  assert.equal(result.unavailableSources, undefined);
});

test("keyword code search also avoids exact counts without a new RPC", async () => {
  const supabase = client((url, init) => {
    assert.ok(url.pathname.endsWith("/library_code_entries"));
    assert.match(new Headers(init?.headers).get("prefer") ?? "", /count=planned/);
    assert.equal(url.searchParams.get("search_vector"), "plfts(english).accounting");
    return rows([codeRow], 80);
  });
  const result = await searchLibrary({ supabase, search: "accounting", sort: "newest", page: 0, limit: 24, kind: "code", useHybrid: false });
  assert.equal(result.data[0].kind, "code");
  assert.equal(result.totalIsEstimate, true);
  assert.equal(result.strategy, "fts-plain");
});

test("a stale nonzero FTS estimate cannot skip metadata fallback on empty rows", async () => {
  const supabase = client((url) => url.searchParams.has("search_vector")
    ? rows([], 100) : rows([codeRow], 1));
  const result = await searchLibrary({ supabase, search: "accounting", sort: "newest", page: 0, limit: 24, kind: "code", useHybrid: false });
  assert.equal(result.strategy, "ilike-and");
  assert.equal(result.data.length, 1);
});

for (const estimate of [0, 2, 100000]) {
  test(`pagination follows returned rows, not the estimate ${estimate}`, async () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ ...codeRow, id: i + 1 }));
    const supabase = client((url) => rows(data.slice(0, Number(url.searchParams.get("limit"))), estimate));
    const first = await browseLibrary({ supabase, sort: "newest", page: 0, limit: 24, kind: "code" });
    assert.equal(first.data.length, 24);
    assert.ok(first.total >= 24);
    assert.equal(first.hasMore, true);
    const last = await browseLibrary({ supabase, sort: "newest", page: 1, limit: 24, kind: "code" });
    assert.equal(last.data.length, 1);
    assert.equal(last.hasMore, false);
  });
}

test("mixed-source pagination keeps cards already fetched after the current page", async () => {
  const supabase = client((url) => url.pathname.endsWith("/library_code_entries")
    ? rows(Array.from({ length: 20 }, (_, i) => ({ ...codeRow, id: i + 1 })), 1)
    : rows(Array.from({ length: 20 }, (_, i) => ({ ...websiteRow, slug: String(i) })), 20));
  const first = await browseLibrary({ supabase, sort: "newest", page: 0, limit: 24 });
  assert.equal(first.data.length, 24);
  assert.equal(first.hasMore, true);
  const last = await browseLibrary({ supabase, sort: "newest", page: 1, limit: 24 });
  assert.equal(last.data.length, 16);
  assert.equal(last.hasMore, false);
});

test("browse stops loading when the existing 96-row merge window is exhausted", async () => {
  const supabase = client((url) => {
    assert.equal(url.searchParams.get("limit"), "96");
    return rows(Array.from({ length: 96 }, (_, i) => ({ ...codeRow, id: i + 1 })), 100000);
  });
  const result = await browseLibrary({ supabase, sort: "newest", page: 3, limit: 24, kind: "code" });
  assert.equal(result.data.length, 24);
  assert.equal(result.hasMore, false);
});

test("empty pages ignore stale estimates and do not advertise more results", async () => {
  const result = await browseLibrary({ supabase: client(() => rows([], 1000)), sort: "newest", page: 0, limit: 24, kind: "code" });
  assert.equal(result.total, 0);
  assert.equal(result.totalIsEstimate, undefined);
  assert.equal(result.hasMore, false);
});

test("actual row-query failures still report an unavailable source", async () => {
  const supabase = client((url) => url.pathname.endsWith("/library_code_entries") ? failure() : rows([websiteRow]));
  const result = await browseLibrary({ supabase, sort: "newest", page: 0, limit: 24 });
  assert.deepEqual(result.unavailableSources, ["code"]);
  assert.equal(result.totalIsEstimate, undefined);
  await assert.rejects(browseLibrary({ supabase, sort: "newest", page: 0, limit: 24, kind: "code" }));
});
