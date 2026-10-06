import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { browseLibrary, searchLibrary } from "../lib/library-query";

const codeRow = {
  id: 1, owner: "example", repo: "accounting", title: "Accounting",
  prompt: "Build accounting software", views: 10, cached_at: "2026-09-01T00:00:00Z",
};
const websiteRow = {
  slug: "accounting", target_url: "https://accounting.example", prompt: "Accounting website",
  cached_at: "2026-09-01T00:00:00Z",
};
const options = { search: "accounting", sort: "newest" as const, page: 0, limit: 24, useHybrid: false };
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let embeddingRequests = 0;

function rows(data: unknown[], total = data.length) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, data.length - 1)}/${total}` },
  });
}
function failure(message = "statement timeout") {
  return Response.json({ code: "57014", message }, { status: 500 });
}
function client(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return createClient("https://database.example", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => handler(new URL(String(input)), init) },
  });
}

beforeEach(() => {
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "test-only-placeholder";
  embeddingRequests = 0;
  globalThis.fetch = async () => {
    embeddingRequests++;
    return Response.json({ data: [{ index: 0, embedding: [0.1, 0.2] }] });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

for (const search of ["accounting,", "project(test)", 'say"hello', String.raw`path\name`, 'x),or(owner.eq.admin']) {
  test(`quotes metadata filter values: ${JSON.stringify(search)}`, async () => {
    const filters: string[] = [];
    const supabase = client((url) => {
      if (url.searchParams.has("search_vector")) return rows([]);
      filters.push(...url.searchParams.getAll("or"));
      return url.pathname.endsWith("library_code_entries") ? rows([codeRow]) : rows([websiteRow]);
    });
    const result = await searchLibrary({ ...options, search, supabase });
    assert.equal(result.total, 2);
    const value = `%${search}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    assert.deepEqual(filters.sort(), [
      `(owner.ilike."${value}",repo.ilike."${value}",title.ilike."${value}")`,
      `(slug.ilike."${value}",target_url.ilike."${value}")`,
    ].sort());
  });
}

test("multi-word OR fallback quotes every word without adding extra predicates", async () => {
  const filters: string[][] = [];
  const supabase = client((url) => {
    if (url.searchParams.has("search_vector")) return rows([]);
    const or = url.searchParams.getAll("or");
    filters.push(or);
    return rows(or.length === 1 ? [codeRow] : []);
  });
  const result = await searchLibrary({ ...options, supabase, kind: "code", search: 'a,b c(d)' });
  assert.equal(result.strategy, "ilike-or");
  assert.deepEqual(filters, [
    ['(owner.ilike."%a,b%",repo.ilike."%a,b%",title.ilike."%a,b%")', '(owner.ilike."%c(d)%",repo.ilike."%c(d)%",title.ilike."%c(d)%")'],
    ['(owner.ilike."%a,b%",repo.ilike."%a,b%",title.ilike."%a,b%",owner.ilike."%c(d)%",repo.ilike."%c(d)%",title.ilike."%c(d)%")'],
  ]);
});

test("embedding failures still run code fallback when websites match", async () => {
  globalThis.fetch = async () => Response.json({ error: { code: "invalid_api_key" } }, { status: 401 });
  const supabase = client((url) => url.pathname.endsWith("library_code_entries") ? rows([codeRow]) : rows([websiteRow]));
  const result = await searchLibrary({ ...options, supabase, useHybrid: true });
  assert.deepEqual(result.data.map((row) => row.kind).sort(), ["code", "website"]);
  assert.equal(result.total, 2);
  assert.equal(result.strategy, "fts-plain");
  assert.equal(result.unavailableSources, undefined);
});

test("empty hybrid rows still run code fallback when websites match", async () => {
  const supabase = client((url) => {
    if (url.pathname.endsWith("hybrid_search")) return rows([]);
    if (url.pathname.endsWith("hybrid_search_count")) return Response.json(0);
    return url.pathname.endsWith("library_code_entries") ? rows([codeRow]) : rows([websiteRow]);
  });
  const result = await searchLibrary({ ...options, supabase, useHybrid: true });
  assert.equal(result.total, 2);
  assert.equal(result.strategy, "fts-plain");
});

test("failed hybrid counts fall back rather than reporting zero with matching rows", async () => {
  const supabase = client((url) => {
    if (url.pathname.endsWith("hybrid_search")) return rows([codeRow]);
    if (url.pathname.endsWith("hybrid_search_count")) return failure();
    return url.pathname.endsWith("library_code_entries") ? rows([codeRow], 7) : rows([websiteRow]);
  });
  const result = await searchLibrary({ ...options, supabase, useHybrid: true });
  assert.equal(result.total, 8);
  assert.equal(result.strategy, "fts-plain");
});

test("hybrid search embeds only once and uses the same vector for rows and count", async () => {
  const vectors: unknown[] = [];
  const supabase = client((url, init) => {
    if (url.pathname.includes("/rpc/")) vectors.push(JSON.parse(String(init?.body)).query_embed);
    if (url.pathname.endsWith("hybrid_search")) return rows([codeRow]);
    if (url.pathname.endsWith("hybrid_search_count")) return Response.json(7);
    return url.pathname.endsWith("library_code_entries") ? rows([codeRow]) : rows([websiteRow]);
  });
  const result = await searchLibrary({ ...options, supabase, useHybrid: true });
  assert.equal(embeddingRequests, 1);
  assert.deepEqual(vectors, [[0.1, 0.2], [0.1, 0.2]]);
  assert.equal(result.strategy, "hybrid");
  assert.equal(result.total, 8);
});

test("FTS timeout recovers through metadata search", async () => {
  const supabase = client((url) => url.searchParams.has("search_vector") ? failure() : rows([codeRow]));
  const result = await searchLibrary({ ...options, supabase, kind: "code" });
  assert.equal(result.strategy, "ilike-and");
  assert.equal(result.total, 1);
});

for (const source of ["code", "website"] as const) {
  test(`marks partial search when the ${source} source fails`, async () => {
    const supabase = client((url) => {
      if (url.pathname.endsWith(`library_${source}_entries`)) return failure();
      return rows(source === "code" ? [websiteRow] : [codeRow]);
    });
    const result = await searchLibrary({ ...options, supabase });
    assert.deepEqual(result.unavailableSources, [source]);
    assert.equal(result.total, 1);
    assert.equal(result.data.length, 1);
  });
  test(`single-source ${source} search reports failure`, async () => {
    await assert.rejects(searchLibrary({ ...options, supabase: client(() => failure()), kind: source }));
  });
}

test("a partial empty search is distinguishable from no matches", async () => {
  const supabase = client((url) => url.pathname.endsWith("library_code_entries") ? failure() : rows([]));
  const result = await searchLibrary({ ...options, supabase });
  assert.equal(result.total, 0);
  assert.deepEqual(result.unavailableSources, ["code"]);
});

test("complete search outage throws instead of returning successful zero results", async () => {
  await assert.rejects(searchLibrary({ ...options, supabase: client(() => failure()) }), /temporarily unavailable/);
});

test("genuine empty results remain a successful search", async () => {
  const result = await searchLibrary({ ...options, supabase: client(() => rows([])) });
  assert.equal(result.total, 0);
  assert.equal(result.unavailableSources, undefined);
});

test("browse preserves partial results and reports total outages", async () => {
  const supabase = client((url) => url.pathname.endsWith("library_code_entries") ? failure() : rows([websiteRow]));
  const result = await browseLibrary({ ...options, supabase });
  assert.equal(result.total, 1);
  assert.deepEqual(result.unavailableSources, ["code"]);
  await assert.rejects(browseLibrary({ ...options, supabase: client(() => failure()) }), /temporarily unavailable/);
});

test("website-only searches never call the embedding provider", async () => {
  const result = await searchLibrary({ ...options, supabase: client(() => rows([websiteRow])), kind: "website", useHybrid: true });
  assert.equal(result.total, 1);
  assert.equal(embeddingRequests, 0);
});


test("an earlier empty FTS response does not hide a failed metadata fallback", async () => {
  const supabase = client((url) => {
    if (url.searchParams.has("search_vector")) return rows([]);
    if (url.pathname.endsWith("library_code_entries")) return failure();
    return rows([websiteRow]);
  });
  const result = await searchLibrary({ ...options, supabase });
  assert.deepEqual(result.unavailableSources, ["code"]);
  assert.equal(result.total, 1);
});
