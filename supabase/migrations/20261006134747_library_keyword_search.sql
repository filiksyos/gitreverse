-- Preserves library_code_entries visibility, existing RLS, text-search semantics,
-- exact totals, newest/oldest/trending ordering, and the app's 96-row merge cap.
-- query_words must be the existing TypeScript searchWords(query_text) result.
-- The caller retains the current strategy fallback order.
CREATE OR REPLACE FUNCTION public.library_keyword_search(
  query_text text,
  query_words text[],
  search_strategy text,
  sort_mode text,
  match_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_query tsquery;
  v_words text[] := COALESCE(query_words, ARRAY[]::text[]);
  v_predicate text;
  v_order text;
  v_since timestamptz;
  v_limit integer := LEAST(96, GREATEST(1, COALESCE(match_count, 24)));
  v_result jsonb;
BEGIN
  -- Only fixed, developer-authored SQL fragments are interpolated below.
  -- All user input is passed as EXECUTE ... USING parameters.
  CASE search_strategy
    WHEN 'fts-plain' THEN
      v_query := pg_catalog.plainto_tsquery('pg_catalog.english'::regconfig, query_text);
      v_predicate := 'c.search_vector @@ $1';
    WHEN 'fts-or' THEN
      v_query := pg_catalog.websearch_to_tsquery(
        'pg_catalog.english'::regconfig, pg_catalog.array_to_string(v_words, ' OR ')
      );
      v_predicate := 'c.search_vector @@ $1';
    WHEN 'ilike-and', 'ilike-or' THEN
      -- Generate one ordinary OR clause per term. Terms remain bound parameters;
      -- only integer array indexes are interpolated. This also leaves the clauses
      -- usable by optional future trigram indexes, unlike a correlated unnest.
      SELECT pg_catalog.string_agg(
        pg_catalog.format($predicate$
          (
            c.owner ILIKE ('%%' || pg_catalog.replace(($2::text[])[%s], '*', '%%') || '%%')
            OR c.repo ILIKE ('%%' || pg_catalog.replace(($2::text[])[%s], '*', '%%') || '%%')
            OR c.title ILIKE ('%%' || pg_catalog.replace(($2::text[])[%s], '*', '%%') || '%%')
          )
        $predicate$, words.i, words.i, words.i),
        CASE WHEN search_strategy = 'ilike-and' THEN ' AND ' ELSE ' OR ' END
        ORDER BY words.i
      ) INTO v_predicate
      FROM pg_catalog.generate_subscripts(v_words, 1) AS words(i);
    ELSE
      RAISE EXCEPTION 'Unsupported library search strategy' USING ERRCODE = '22023';
  END CASE;

  -- The existing code adds no search filter when searchWords is empty.
  IF pg_catalog.cardinality(v_words) = 0 THEN
    v_predicate := 'true';
  END IF;

  CASE sort_mode
    WHEN 'oldest' THEN
      v_order := 'm.cached_at ASC, m.views DESC, m.id DESC';
    WHEN 'newest' THEN
      v_order := 'm.cached_at DESC, m.views DESC, m.id DESC';
    WHEN 'trending' THEN
      v_order := 'm.views DESC, m.cached_at DESC, m.id DESC';
      v_since := pg_catalog.now() - INTERVAL '30 days';
      v_predicate := '(' || v_predicate || ') AND c.cached_at >= $3';
    ELSE
      RAISE EXCEPTION 'Unsupported library sort mode' USING ERRCODE = '22023';
  END CASE;

  -- Dynamic SQL deliberately gets a fresh plan for each query. This avoids a
  -- generic CASE/OR strategy predicate hiding the FTS condition from the planner.
  EXECUTE pg_catalog.format($query$
    WITH matched AS MATERIALIZED (
      SELECT c.id, c.cached_at, c.views
      FROM public.library_code_entries AS c
      WHERE %s
    ),
    page AS MATERIALIZED (
      SELECT m.id, pg_catalog.row_number() OVER (ORDER BY %s) AS ordinal
      FROM matched AS m
      ORDER BY %s
      LIMIT $4
    )
    SELECT pg_catalog.jsonb_build_object(
      'total', (SELECT pg_catalog.count(*) FROM matched),
      'rows', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', c.id,
            'owner', c.owner,
            'repo', c.repo,
            'prompt', pg_catalog.left(c.prompt, 180),
            'cached_at', c.cached_at,
            'views', c.views,
            'title', c.title
          ) ORDER BY p.ordinal
        )
        FROM page AS p
        JOIN public.library_code_entries AS c ON c.id = p.id
      ), '[]'::jsonb)
    )
  $query$, v_predicate, v_order, v_order)
  INTO v_result
  USING v_query, v_words, v_since, v_limit;

  RETURN v_result;
END;
$function$;

-- Restrict this new endpoint to existing library audiences. SECURITY INVOKER and
-- the existing security-invoker view continue to enforce caller permissions/RLS.
REVOKE ALL ON FUNCTION public.library_keyword_search(text, text[], text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.library_keyword_search(text, text[], text, text, integer) TO anon, authenticated;
