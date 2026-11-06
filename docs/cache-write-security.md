# Cache write authorization

Public Supabase keys are intentionally public. Generated cache content must be writable only by trusted server code, not by anonymous or ordinary signed-in API clients.

## Release order

1. Confirm production has `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Never print or expose credential values.
2. Deploy this code before applying `20261106094932_restrict_cache_writes.sql`. It keeps public reads on the publishable client and moves cache generation, title/embedding backfills, and view counting to the existing privileged server client.
3. Apply the migration using the authorized production database management path. It removes non-SELECT policies and write grants (including column grants) on eight generated caches and `view_log`, and limits the three view-count RPCs to the service role. Missing legacy tables/functions are skipped.
4. Verify catalog privileges/policies, public library reads, admin backfill authorization, and normal generation/view counting. Do not poison a production row as a security test. Use a staging fixture for write-denial tests.

## Authorization boundaries

- `lib/supabase.ts` is marked `server-only`; it must never be imported into browser code.
- The reverse-prompt endpoint accepts a repository identifier, not arbitrary cached prompt text. Writes contain server-generated output.
- Website keys must match the URL-derived slug. Forced refreshes overwrite shared content and now require `ADMIN_SECRET` authorization. Regular users can still generate cache misses and read existing entries.
- Website storage binds an existing slug to its exact URL, including collision cases, and uses insert rather than upsert for new entries. A racing insert fails instead of overwriting a different URL. No credentials or arbitrary supplied prompt contents are accepted from the browser.
- Admin title/embedding endpoints retain their existing authorization checks before obtaining privileged access.
- This does not change JWT verification, billing, or user-history ownership policies.

## Verification

`pnpm test:cache-security` runs actual PostgreSQL role/RLS behavior in isolated PGlite databases, without production connectivity. It checks anonymous/authenticated write denials, column-grant removal, direct view-RPC denials, public reads, service-role writes, idempotence, and absent legacy objects. Route tests reject untrusted slug/refresh requests and verify privileged website writes with a local fetch stub.

Run the full suite with `node --conditions=react-server --import tsx --test tests/*.test.ts`, plus TypeScript and targeted lint. The React server condition is required when testing server-only imports outside Next.js.

## Rollback and limitations

Do not restore insecure public write policies to undo an application problem. Keep the migrated database locked down and forward-fix server writes; reverting to an older application that uses anonymous writes would lose cache persistence and view updates. Preserve the previous deployment for inspection but do not promote it after migration without equivalent privileged writers.

This closes direct API cache poisoning; it does not establish whether historical cache rows were modified. Review historical integrity separately. It also does not claim to solve adversarial source content or all existing SQL/security advisories. Legacy feature writers absent from current main must use server credentials before being reintroduced.
