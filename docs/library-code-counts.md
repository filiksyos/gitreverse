# Library code-source timeout repair

## Diagnosis (2026-10-29)

Blank production Library browse returned only website cards with `unavailableSources: ["code"]`; code-only browse returned HTTP 503. PostgreSQL logs showed repeated SQLSTATE `57014` cancellations for code browse's combined page plus exact-count statement. Code rows, the cached-at/trending/FTS indexes, the existing security-invoker view, and its SELECT visibility were present.

Read-only anonymous-role probes using the existing 3-second statement limit isolated the count dependency. Count-free PostgREST-shaped pages passed: newest ~17 ms, oldest ~28 ms, trending ~39 ms, accounting FTS ~172 ms, and no-match FTS ~150 ms. Combined newest page/count probes took ~2.5–2.9 seconds and production requests timed out. Separate exact trending and FTS counts also timed out, so merely splitting row/count requests is not a sufficient repair. Runtime varies; this is not evidence of a deterministic prompt-hydration or parallel-query issue.

## Change

- Code browse and keyword fallback use PostgREST `count: "planned"`, avoiding a full exact-count scan. This uses the same public view, publishable client, RLS, fields, filters, ordering, and 96-row per-source fetch bound.
- Responses label estimated totals with `totalIsEstimate`. The UI shows `~` / `About`, and structured data omits an estimated `numberOfItems`.
- Returned rows are authoritative: stale nonzero estimates cannot skip search fallback on an empty response, and estimates cannot report fewer results than the rows already fetched.
- `hasMore` follows the fetched merged window instead of an estimate. It stops on a partial page and at 96 displayed results. The prior cap was per source, which could expose more mixed entries, but merging deeper pages without fetching additional source rows is not reliable. This change makes the safe global stopping boundary explicit instead of repeatedly loading an exhausted window.
- Existing partial-source and true-outage reporting remains intact; the initial cached result key is bumped.

[PostgREST count documentation](https://postgrest.org/en/stable/references/api/pagination_count.html) describes the planned-count tradeoff. Counts are intentionally approximate; cards are real returned rows.

## Scope and rollout

No migration, function, index, grants, RLS, secrets, embeddings provider, or timeout setting is changed. This is independent of draft PR #168 and does not apply its denied/pending RPC migration. Some keyword metadata queries can still time out even without exact counts; this does not claim to solve all keyword-query planning issues.

The code must still be reviewed, merged and deployed with owner authorization before production behavior changes. After deployment, check blank Library (both sources), code-only newest/oldest/trending, pagination, and an existing keyword result. Verify the deployed commit and absence of code-source errors; don't infer deployment from a green test run.

## Verification

- Credential-free full suite: `node --import tsx --test tests/*.test.ts` (72 tests, including 34 Library tests).
- TypeScript and focused ESLint pass; production Next build passes without production credentials (local-only `VIEWS_IP_SALT` placeholder).
- Independent review found no blockers.
- Read-only production SQL shape checks pass as noted above; these are not deployed REST/UI verification.
- Repository-wide lint retains one pre-existing error in `lib/use-partner-preview.ts` and two pre-existing accessibility warnings in `components/reverse-prompt-home.tsx`.
- Local API and server-rendered HTML smoke checks passed with a credential-free mock database that rejects exact code counts; code cards, approximate labels, and `hasMore` were present without an outage warning.
- Local interactive Chromium QA was blocked by the executor's IPC/sandbox startup limitation; cloud browser cannot access this executor's loopback server. Do not count the attempted browser suite as passed.
