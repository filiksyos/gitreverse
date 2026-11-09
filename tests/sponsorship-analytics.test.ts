import assert from "node:assert/strict";
import test from "node:test";
import { formatMonthlyVisitors, ownerTrafficSnapshot, parseSponsorTraffic, previousCalendarMonth, snapshotReportedMonth } from "../lib/sponsorship-analytics";
const now = new Date("2026-10-08T08:00:00Z");
const row = {window_key:"previous_calendar_month",window_start:"2026-09-01T00:00:00Z",window_end:"2026-10-01T00:00:00Z",daily_unique_visits:35087,missing_device_events:0,measured_at:"2026-10-08T07:43:00Z"};

test("previous complete calendar month handles year rollover", () => {
  assert.equal(previousCalendarMonth(new Date("2027-01-01T00:00:00Z")).start.toISOString(), "2026-12-01T00:00:00.000Z");
});

test("monthly traffic displays exact counts and never relabels last month's stale period", () => {
  const result = parseSponsorTraffic([row],now);
  assert.equal(result?.visitors,35087);
  assert.equal(formatMonthlyVisitors(result!.visitors),"35,087");
  assert.equal(parseSponsorTraffic([row],new Date("2026-11-01T00:00:00Z")),null);
});

test("monthly analytics rejects errors, unsafe numbers, missing identifiers and stale measurements", () => {
  for (const value of [null,{},[],[{...row,daily_unique_visits:-1}],[{...row,daily_unique_visits:null}],[{...row,daily_unique_visits:""}],[{...row,daily_unique_visits:"NaN"}],[{...row,missing_device_events:1}],[{...row,measured_at:"2026-10-06T00:00:00Z"}],[{...row,window_start:"2026-08-01T00:00:00Z"}],[{...row,window_key:"rolling_30_days"}]]) assert.equal(parseSponsorTraffic(value,now),null);
  assert.equal(parseSponsorTraffic([{...row,daily_unique_visits:0}],now)?.visitors,0);
});

test("owner-reported monthly audience keeps the exact count and its supplied date", () => {
  const snapshot = ownerTrafficSnapshot();
  assert.equal(snapshot.visitors, 44256);
  assert.equal(formatMonthlyVisitors(snapshot.visitors), "44,256");
  assert.equal(snapshot.reportedAt, "2026-11-09T00:00:00.000Z");
  assert.equal(snapshotReportedMonth(snapshot), "November 2026");
  // A reported snapshot has no invented calendar-month range or automatic expiry.
  assert.equal("periodStart" in snapshot, false);
  assert.equal("periodEnd" in snapshot, false);
});
