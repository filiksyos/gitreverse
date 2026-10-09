-- Reviewed deployment SQL, not an automatically applied migration.
-- Execute this entire transaction atomically. Never expose raw analytics grants.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_sponsorship_audience()
RETURNS TABLE (
  window_key text,
  window_start timestamptz,
  window_end timestamptz,
  daily_unique_visits bigint,
  raw_pageview_events bigint,
  first_event_at timestamptz,
  latest_event_at timestamptz,
  active_utc_dates bigint,
  missing_device_events bigint,
  measured_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
SET timezone = 'UTC'
AS $function$
  WITH bounds AS (
    SELECT statement_timestamp() AS measured,
      date_trunc('month', statement_timestamp()) AS month_start
  ), windows AS (
    SELECT 'rolling_30_days'::text AS key,
      measured - interval '30 days' AS start_at,
      measured AS end_at, measured
    FROM bounds
    UNION ALL
    SELECT 'previous_calendar_month'::text,
      month_start - interval '1 month', month_start, measured
    FROM bounds
  ), filtered AS MATERIALIZED (
    -- Read and canonical-filter the union of both windows only once.
    SELECT e.event_timestamp,
      (e.event_timestamp AT TIME ZONE 'UTC')::date AS event_date,
      e.device_id
    FROM public.vercel_analytics_events_raw AS e
    WHERE e.project_id = 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF'
      AND e.vercel_environment = 'production'
      AND e.event_type = 'pageview'
      AND e.origin ~ '^https://(www\.)?gitreverse\.com([/?#]|$)'
      AND e.event_timestamp >= (SELECT min(start_at) FROM windows)
      AND e.event_timestamp < (SELECT max(end_at) FROM windows)
  )
  SELECT w.key, w.start_at, w.end_at,
    a.daily_unique_visits, a.raw_pageview_events,
    a.first_event_at, a.latest_event_at, a.active_utc_dates,
    a.missing_device_events, w.measured
  FROM windows AS w
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE device_id IS NOT NULL) AS daily_unique_visits,
      coalesce(sum(event_count), 0)::bigint AS raw_pageview_events,
      min(first_at) AS first_event_at,
      max(latest_at) AS latest_event_at,
      count(DISTINCT event_date) AS active_utc_dates,
      coalesce(sum(event_count) FILTER (WHERE device_id IS NULL), 0)::bigint
        AS missing_device_events
    FROM (
      -- Scalar grouping avoids expensive composite COUNT(DISTINCT) comparison.
      -- Keep null-device groups for raw-event and missing-device totals.
      SELECT e.event_date, e.device_id, count(*) AS event_count,
        min(e.event_timestamp) AS first_at, max(e.event_timestamp) AS latest_at
      FROM filtered AS e
      WHERE e.event_timestamp >= w.start_at AND e.event_timestamp < w.end_at
      GROUP BY e.event_date, e.device_id
    ) AS daily_devices
  ) AS a;
$function$;

REVOKE ALL ON FUNCTION public.get_sponsorship_audience() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sponsorship_audience() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sponsorship_audience() TO service_role;
COMMENT ON FUNCTION public.get_sponsorship_audience() IS
  'Server-only fixed-window sponsor audience aggregates. Daily-reset Vercel identifiers are not unique people across days. No raw rows are returned.';
COMMIT;
