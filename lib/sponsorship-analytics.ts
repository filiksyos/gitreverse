export type SponsorTraffic = {
  visitors: number;
  periodStart: string;
  periodEnd: string;
  measuredAt: string;
};

export function previousCalendarMonth(now: Date) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

/** Owner-reported monthly audience, dated when supplied rather than assigned an unverified period. */
export function ownerTrafficSnapshot() {
  return {
    visitors: 44256,
    reportedAt: "2026-11-09T00:00:00.000Z",
  };
}

export function formatMonthlyVisitors(visitors: number) {
  return new Intl.NumberFormat("en-US").format(visitors);
}

export function snapshotReportedMonth(snapshot: ReturnType<typeof ownerTrafficSnapshot>) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(snapshot.reportedAt));
}

export function trafficPeriodLabel(traffic: SponsorTraffic) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(traffic.periodStart));
}

export function parseSponsorTraffic(value: unknown, now: Date): SponsorTraffic | null {
  if (!Array.isArray(value)) return null;
  const row = value.find((entry) => entry && entry.window_key === "previous_calendar_month");
  if (!row || typeof row !== "object") return null;
  const visitors = Number(row.daily_unique_visits);
  if (!Number.isSafeInteger(visitors) || visitors < 0 || row.daily_unique_visits === null || row.daily_unique_visits === "") return null;
  if (Number(row.missing_device_events) !== 0) return null;
  const measuredAt = Date.parse(row.measured_at);
  if (!Number.isFinite(measuredAt) || measuredAt > now.getTime() + 60000 || now.getTime() - measuredAt > 86400000) return null;
  const { start, end } = previousCalendarMonth(now);
  if (Date.parse(row.window_start) !== start.getTime() || Date.parse(row.window_end) !== end.getTime()) return null;
  return { visitors, periodStart: start.toISOString(), periodEnd: end.toISOString(), measuredAt: new Date(measuredAt).toISOString() };
}
