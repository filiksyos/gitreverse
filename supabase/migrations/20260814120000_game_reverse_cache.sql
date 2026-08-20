CREATE TABLE IF NOT EXISTS public.game_reverse_cache (
  slug text PRIMARY KEY,
  game_name text NOT NULL,
  spec_md text NOT NULL,
  prompt text NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NULL
);

ALTER TABLE public.game_reverse_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read game_reverse_cache"
  ON public.game_reverse_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon can insert game_reverse_cache"
  ON public.game_reverse_cache
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon can update game_reverse_cache"
  ON public.game_reverse_cache
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS game_reverse_cache_cached_at_idx
  ON public.game_reverse_cache (cached_at DESC);

CREATE OR REPLACE VIEW public.library_game_entries
WITH (security_invoker = true) AS
SELECT
  slug,
  game_name,
  left(prompt, 180) AS prompt,
  cached_at
FROM public.game_reverse_cache;

GRANT SELECT ON public.library_game_entries TO anon, authenticated;
