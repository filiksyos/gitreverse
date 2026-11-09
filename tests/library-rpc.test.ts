import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { searchLibrary } from "../lib/library-query";

const row = { id: 1, owner: "example", repo: "accounting", title: "Accounting", prompt: "Preview", cached_at: "2026-09-01T00:00:00Z", views: 1 };
const options = { search: "accounting", sort: "newest" as const, page: 0, limit: 24, useHybrid: false, kind: "code" as const };
function client(handler: (params: Record<string, unknown>) => Response) {
  return createClient("https://database.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      assert.ok(String(input).endsWith("/rpc/library_keyword_search"), "must use the optimized RPC, not the legacy query");
      return handler(JSON.parse(String(init?.body)));
    } },
  });
}

for (const search of ["accounting,", "a(b)", 'a"b', String.raw`a\b`, "first, second(test)"]) {
  test(`passes search terms as RPC data: ${JSON.stringify(search)}`, async () => {
    let calls = 0;
    const supabase = client((params) => {
      calls++;
      assert.deepEqual(params, {
        query_text: search, query_words: search.split(/\s+/u), search_strategy: "fts-plain",
        sort_mode: "newest", match_count: 24,
      });
      return Response.json({ rows: [row], total: 17 });
    });
    const result = await searchLibrary({ ...options, search, supabase });
    assert.equal(calls, 1);
    assert.equal(result.total, 17);
    assert.equal(result.data[0].id, 1);
  });
}

test("RPC fallback preserves strategy order and supplies original search words", async () => {
  const strategies: unknown[] = [];
  const supabase = client((params) => {
    strategies.push(params.search_strategy);
    assert.deepEqual(params.query_words, ["first,", 'second"']);
    return Response.json({ rows: params.search_strategy === "ilike-or" ? [row] : [], total: params.search_strategy === "ilike-or" ? 1 : 0 });
  });
  const result = await searchLibrary({ ...options, search: 'first, second"', supabase });
  assert.deepEqual(strategies, ["fts-plain", "fts-or", "ilike-and", "ilike-or"]);
  assert.equal(result.strategy, "ilike-or");
});

test("RPC FTS failure can recover via the metadata strategy", async () => {
  const supabase = client((params) => params.search_strategy === "fts-plain"
    ? Response.json({ code: "57014", message: "timeout" }, { status: 500 })
    : Response.json({ rows: [row], total: 1 }));
  const result = await searchLibrary({ ...options, supabase });
  assert.equal(result.strategy, "ilike-and");
});

test("RPC errors do not silently run the expensive legacy queries", async () => {
  const supabase = client(() => Response.json({ code: "57014", message: "timeout" }, { status: 500 }));
  await assert.rejects(searchLibrary({ ...options, supabase }), /temporarily unavailable/);
});

test("an invalid RPC response is a source failure, not a successful empty search", async () => {
  await assert.rejects(searchLibrary({ ...options, supabase: client(() => Response.json(null)) }), /temporarily unavailable/);
});

test("empty RPC results remain a genuine no-match search", async () => {
  const result = await searchLibrary({ ...options, supabase: client(() => Response.json({ rows: [], total: 0 })) });
  assert.equal(result.total, 0);
  assert.equal(result.unavailableSources, undefined);
});

test("RPC fetch limits stay capped and match the selected sort", async () => {
  const supabase = client((params) => {
    assert.equal(params.match_count, 96);
    assert.equal(params.sort_mode, "oldest");
    return Response.json({ rows: [row], total: 100 });
  });
  await searchLibrary({ ...options, supabase, sort: "oldest", page: 10 });
});
