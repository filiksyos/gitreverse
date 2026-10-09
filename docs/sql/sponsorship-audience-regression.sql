-- Read-only regression: synthetic data only; no function/schema changes.
-- Covers UTC dates, same-device duplicates, missing devices, empty windows,
-- partial-day and month boundaries, canonical domains and fixed data scope.
WITH fixtures(event_timestamp, device_id, project_id, vercel_environment, event_type, origin) AS (
  VALUES
    (timestamptz '2026-09-01 00:00:00+00', 1::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-01 01:00:00+00', 1::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-02 00:00:00+00', 1::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-09 10:59:59+00', 2::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-09 11:00:00+00', 2::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-09 12:00:00+00', 2::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-09 13:00:00+00', NULL::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-09 14:00:00+00', NULL::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-10 01:00:00+02', 3::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-10 02:00:00+02', 3::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-30 23:59:59+00', 4::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-10-01 00:00:00+00', 4::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-10-09 10:59:59+00', 5::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-10-09 11:00:00+00', 6::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-08-31 23:59:59+00', 7::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-15 12:00:00+00', 100::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://www.gitreverse.com/path'),
    (timestamptz '2026-09-15 12:00:00+00', 101::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com?x=1'),
    (timestamptz '2026-09-15 12:00:00+00', 102::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com#anchor'),
    (timestamptz '2026-09-15 12:00:00+00', 103::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse.com.evil.example'),
    (timestamptz '2026-09-15 12:00:00+00', 104::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'http://gitreverse.com'),
    (timestamptz '2026-09-15 12:00:00+00', 105::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://gitreverse-com.example'),
    (timestamptz '2026-09-15 12:00:00+00', 106::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'pageview', 'https://preview.gitreverse.com'),
    (timestamptz '2026-09-15 12:00:00+00', 107::bigint, 'other_project', 'production', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-15 12:00:00+00', 108::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'preview', 'pageview', 'https://gitreverse.com'),
    (timestamptz '2026-09-15 12:00:00+00', 109::bigint, 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF', 'production', 'custom', 'https://gitreverse.com')
), original AS (
WITH windows(key, start_at, end_at, measured) AS (
    VALUES
      ('previous_calendar_month', timestamptz '2026-09-01 00:00:00+00', timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-10-09 11:00:00+00'),
      ('rolling_30_days', timestamptz '2026-09-09 11:00:00+00', timestamptz '2026-10-09 11:00:00+00', timestamptz '2026-10-09 11:00:00+00'),
      ('null_devices_only', timestamptz '2026-09-09 13:00:00+00', timestamptz '2026-09-09 15:00:00+00', timestamptz '2026-10-09 11:00:00+00'),
      ('empty', timestamptz '2027-01-01 00:00:00+00', timestamptz '2027-01-02 00:00:00+00', timestamptz '2026-10-09 11:00:00+00')
  )
  SELECT w.key, w.start_at, w.end_at,
    a.daily_unique_visits, a.raw_pageview_events,
    a.first_event_at, a.latest_event_at, a.active_utc_dates,
    a.missing_device_events, w.measured
  FROM windows AS w
  CROSS JOIN LATERAL (
    SELECT
      count(DISTINCT ((e.event_timestamp AT TIME ZONE 'UTC')::date, e.device_id))
        FILTER (WHERE e.device_id IS NOT NULL) AS daily_unique_visits,
      count(*) AS raw_pageview_events,
      min(e.event_timestamp) AS first_event_at,
      max(e.event_timestamp) AS latest_event_at,
      count(DISTINCT (e.event_timestamp AT TIME ZONE 'UTC')::date) AS active_utc_dates,
      count(*) FILTER (WHERE e.device_id IS NULL) AS missing_device_events
    FROM fixtures AS e
    WHERE e.project_id = 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF'
      AND e.vercel_environment = 'production'
      AND e.event_type = 'pageview'
      AND e.origin ~ '^https://(www\.)?gitreverse\.com([/?#]|$)'
      AND e.event_timestamp >= w.start_at
      AND e.event_timestamp < w.end_at
  ) AS a
), candidate AS (
WITH windows(key, start_at, end_at, measured) AS (
    VALUES
      ('previous_calendar_month', timestamptz '2026-09-01 00:00:00+00', timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-10-09 11:00:00+00'),
      ('rolling_30_days', timestamptz '2026-09-09 11:00:00+00', timestamptz '2026-10-09 11:00:00+00', timestamptz '2026-10-09 11:00:00+00'),
      ('null_devices_only', timestamptz '2026-09-09 13:00:00+00', timestamptz '2026-09-09 15:00:00+00', timestamptz '2026-10-09 11:00:00+00'),
      ('empty', timestamptz '2027-01-01 00:00:00+00', timestamptz '2027-01-02 00:00:00+00', timestamptz '2026-10-09 11:00:00+00')
  ), filtered AS MATERIALIZED (
    -- Read and canonical-filter the union of both windows only once.
    SELECT e.event_timestamp,
      (e.event_timestamp AT TIME ZONE 'UTC')::date AS event_date,
      e.device_id
    FROM fixtures AS e
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
  ) AS a
), differences AS (
  (SELECT * FROM original EXCEPT ALL SELECT * FROM candidate)
  UNION ALL
  (SELECT * FROM candidate EXCEPT ALL SELECT * FROM original)
), expected(key, daily_unique_visits, raw_pageview_events, active_utc_dates, missing_device_events) AS (
  VALUES
    ('previous_calendar_month', 9::bigint, 14::bigint, 6::bigint, 2::bigint),
    ('rolling_30_days', 9::bigint, 12::bigint, 6::bigint, 2::bigint),
    ('null_devices_only', 0::bigint, 2::bigint, 1::bigint, 2::bigint),
    ('empty', 0::bigint, 0::bigint, 0::bigint, 0::bigint)
)
SELECT
  NOT EXISTS (SELECT 1 FROM differences) AS equivalent_all_fields,
  NOT EXISTS (
    SELECT c.key FROM candidate c FULL JOIN expected e USING (key)
    WHERE c.key IS NULL OR e.key IS NULL OR (c.daily_unique_visits, c.raw_pageview_events, c.active_utc_dates, c.missing_device_events)
      IS DISTINCT FROM
      (e.daily_unique_visits, e.raw_pageview_events, e.active_utc_dates, e.missing_device_events)
  ) AS expected_counts_match,
  (SELECT first_event_at IS NULL AND latest_event_at IS NULL FROM candidate WHERE key = 'empty') AS empty_dates_are_null,
  (SELECT jsonb_agg(c ORDER BY key) FROM candidate c) AS actual;
