-- Run as a standalone statement outside a transaction to keep ingestion available.
-- Narrow covering index for the existing server-only audience RPC.
-- Does not change role grants, RLS, credentials, or statement timeouts.
CREATE INDEX CONCURRENTLY vercel_analytics_sponsorship_audience_idx
ON public.vercel_analytics_events_raw (event_timestamp DESC) INCLUDE (device_id)
WHERE project_id = 'prj_z7TUohej5S9f0TFdK6BKZX0FkDaF'
  AND vercel_environment = 'production'
  AND event_type = 'pageview'
  AND origin ~ '^https://(www\.)?gitreverse\.com([/?#]|$)';
