import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rpc = readFileSync("docs/sql/sponsorship-audience-rpc.sql", "utf8");
const regression = readFileSync("docs/sql/sponsorship-audience-regression.sql", "utf8");
const index = readFileSync("docs/sql/sponsorship-audience-index.sql", "utf8");

test("audience optimization preserves server-only execution and fixed scope", () => {
  assert.match(rpc, /SECURITY INVOKER/);
  assert.match(rpc, /SET search_path = pg_catalog/);
  assert.match(rpc, /SET timezone = 'UTC'/);
  assert.match(rpc, /REVOKE ALL ON FUNCTION public\.get_sponsorship_audience\(\) FROM PUBLIC/);
  assert.match(rpc, /FROM anon, authenticated/);
  assert.match(rpc, /GRANT EXECUTE.*TO service_role/);
  assert.doesNotMatch(rpc, /SECURITY DEFINER|SET statement_timeout|GRANT SELECT/);
});

test("synthetic regression exercises the deployed optimized aggregate body", () => {
  const aggregate = rpc.slice(rpc.indexOf("  ), filtered AS MATERIALIZED"), rpc.indexOf("$function$;")).trim().replace(/;$/, "").replace("public.vercel_analytics_events_raw", "fixtures");
  assert.ok(regression.includes(aggregate));
  assert.match(regression, /equivalent_all_fields/);
  assert.match(regression, /expected_counts_match/);
  assert.match(regression, /empty_dates_are_null/);
});

test("covering index uses concurrent creation and the same scope predicate", () => {
  assert.match(index, /CREATE INDEX CONCURRENTLY/);
  assert.match(index, /INCLUDE \(device_id\)/);
  const predicate = rpc.slice(rpc.indexOf("WHERE e.project_id"), rpc.indexOf("      AND e.event_timestamp >=")).replaceAll("e.", "").replace(/\s+/g, " ").trim();
  assert.ok(index.replace(/\s+/g, " ").includes(predicate));
  assert.doesNotMatch(index, /BEGIN;|GRANT |ALTER ROLE|ALTER TABLE/);
});
