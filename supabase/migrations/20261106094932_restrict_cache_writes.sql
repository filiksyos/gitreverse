-- Deploy server-only writers BEFORE applying this migration.
-- Public reads remain unchanged. Generated content is never client-writable.
DO $migration$
DECLARE
  table_name text;
  policy_row record;
  column_row record;
  function_row record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'prompt_cache', 'custom_prompt_cache', 'deep_report_cache',
    'website_reverse_cache', 'website_swap_cache', 'profile_reverse_cache',
    'game_reverse_cache', 'object3d_reverse_cache', 'view_log'
  ] LOOP
    -- Some legacy products are not present in every installation.
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_row IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND cmd <> 'SELECT'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, table_name);
    END LOOP;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    -- Table REVOKE does not remove independently granted column privileges.
    FOR column_row IN SELECT attname FROM pg_attribute
      WHERE attrelid = to_regclass(format('public.%I', table_name))
        AND attnum > 0 AND NOT attisdropped
    LOOP
      EXECUTE format('REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        column_row.attname, column_row.attname, column_row.attname, table_name);
    END LOOP;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;

  -- Invoker view counting also now goes through the validated server endpoint.
  -- Definer variants must not remain a public write bypass.
  FOR function_row IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('increment_views', 'increment_profile_views', 'increment_object3d_views')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_row.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_row.signature);
  END LOOP;
END;
$migration$;
