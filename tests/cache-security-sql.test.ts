import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrations/20261106092711_restrict_cache_writes.sql", "utf8");
const tables = ["prompt_cache", "custom_prompt_cache", "deep_report_cache", "website_reverse_cache", "website_swap_cache", "profile_reverse_cache", "game_reverse_cache", "object3d_reverse_cache", "view_log"];

test("migration blocks anonymous and signed-in writes but retains reads and trusted writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
    for (const table of tables) {
      await db.exec(`CREATE TABLE public.${table} (id integer PRIMARY KEY, prompt text);
        INSERT INTO public.${table} VALUES (1, 'trusted');
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        GRANT ALL ON public.${table} TO anon, authenticated;
        GRANT INSERT (prompt), UPDATE (prompt) ON public.${table} TO PUBLIC;
        CREATE POLICY read_public ON public.${table} FOR SELECT TO anon, authenticated USING (true);
        CREATE POLICY insert_public ON public.${table} FOR INSERT TO anon, authenticated WITH CHECK (true);
        CREATE POLICY update_public ON public.${table} FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);`);
    }
    await db.exec(`CREATE FUNCTION public.increment_views() RETURNS void LANGUAGE sql AS $$ UPDATE public.prompt_cache SET prompt = 'view'; $$;
      CREATE FUNCTION public.increment_profile_views() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.profile_reverse_cache SET prompt = 'view'; $$;
      CREATE FUNCTION public.increment_object3d_views() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.object3d_reverse_cache SET prompt = 'view'; $$;`);
    await db.exec(migration);
    await db.exec(migration); // idempotence
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of tables) {
        const { rows } = await db.query(`SELECT prompt FROM public.${table}`);
        assert.deepEqual(rows, [{ prompt: "trusted" }]);
        for (const sql of [
          `INSERT INTO public.${table} VALUES (2, 'poison')`,
          `UPDATE public.${table} SET prompt = 'poison' WHERE id = 1`,
          `DELETE FROM public.${table} WHERE id = 1`,
          `TRUNCATE public.${table}`,
        ]) await assert.rejects(db.exec(sql), /permission denied/);
      }
      for (const name of ["increment_views", "increment_profile_views", "increment_object3d_views"]) {
        await assert.rejects(db.exec(`SELECT public.${name}()`), /permission denied/);
      }
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    for (const table of tables) {
      await db.exec(`INSERT INTO public.${table} VALUES (2, 'new'); UPDATE public.${table} SET prompt = 'updated' WHERE id = 2; DELETE FROM public.${table} WHERE id = 2;`);
    }
    await db.exec("SELECT public.increment_views(); SELECT public.increment_profile_views(); SELECT public.increment_object3d_views(); RESET ROLE;");
  } finally { await db.close(); }
});

test("migration tolerates installations without legacy caches or view RPCs", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
    await db.exec(migration);
  } finally { await db.close(); }
});
