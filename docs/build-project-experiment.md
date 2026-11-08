# Build to GitHub experiment

Branch: `experiment/build-to-github`. This is a private-tester experiment, not a public production rollout.

## What changed

The existing codebase and website prompt action rows gain a **Build** button. It generates a bounded source-file manifest, then offers a ZIP download and an explicitly confirmed **Create private GitHub repo** action. No new editor, page, paid sandbox, deployment button, or production schema is added.

Earlier branches `builder-buttons-analytics` and `replit` add links to external builders. They do not implement a native source-generation or GitHub export backend. This branch starts from current `main` so existing library and cache fixes stay intact.

## Enable on an isolated preview

Both flags default off. Set the public flag at build time, the server flag at runtime, and allowlist exact Supabase user UUIDs. A missing allowlist denies everyone. The normal authentication bypass setting does not bypass this endpoint.

```dotenv
NEXT_PUBLIC_GITREVERSE_BUILD_ENABLED=true
GITREVERSE_BUILD_ENABLED=true
GITREVERSE_BUILD_ALLOWED_USER_IDS=your-supabase-user-uuid
GITREVERSE_BUILD_PROVIDER=azure
GITREVERSE_BUILD_MODEL=gpt-5.4
```

Use the existing server-side `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for verified auth. The browser requires matching `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Providers:

- Azure: existing `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, and optional `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`. Only HTTPS Azure OpenAI/Foundry hostnames are accepted. For example, the model alias `gpt-5.4` can map to your own `gpt-5.4-mini` deployment.
- OpenAI: set provider to `openai`, `OPENAI_API_KEY`, and optionally a compatible model via `GITREVERSE_BUILD_MODEL`. Default is `gpt-5.4-mini`. The endpoint is pinned to the official API.
- The adapter requires chat-completions JSON mode, `max_completion_tokens`, and low reasoning effort. Model capability/access must be verified on the target account. Bedrock and Ethiopex runtime integration are not included in this experiment.

Keys are server environment values, never committed or browser-visible. Do not reuse tokens from chat in source or test fixtures. Only synthetic placeholder tokens are used in tests.

## Safety and behavior

- Requests verify the Bearer token with Supabase `getUser`. No unverified JWT fallback. Origin must match the application origin.
- Five generation attempts per user per hour, one at a time **per server process**. Generation is bounded to 90 seconds, 16,000 output tokens, 60 files, 300 KB total text, and a 24,000-character prompt. This is a preview cost guard, not production billing or distributed limiting.
- The model has no tools and generated code is never run, installed, hosted, or deployed by GitReverse. The UI explicitly says it has not been run or tested. Downloaded code can contain malicious scripts, unsafe dependencies, or bugs despite validation; inspect it before execution.
- ZIP paths disallow traversal, absolute paths, Windows devices, file/directory collisions, duplicate case-insensitive names, secret files, binary NULs, `.git`, `.github`, dependency folders and key material. Pattern-based secret checks are defense in depth, not a complete secret scanner.
- Build state is scoped to the prompt and current signed-in user. Sign-out/account switching clears the result and cancels generation. Export is never automatically retried or canceled because its mutation could already have executed.
- Normal GitHub login remains `read:user user:email`. Export requests the broader `repo` OAuth permission only through a separate, explicit button. That scope can access private repositories, even though this flow only creates a new private repository. The existing Supabase session implementation persists this provider token in browser localStorage. A short-lived server-side GitHub App flow is recommended before wider rollout.
- Server compares GitHub `/user` ID with the verified Supabase GitHub identity. Email is never used to bind accounts. Export only calls new-private-repo creation, writes a new tree/commit, updates the new repository without force, and verifies the final commit. Existing repository names produce a conflict, never an overwrite.
- Network errors, truncated responses, and partial exports return a recovery link where possible. Inspect that repository before any retry. No automatic delete/cleanup or republishing occurs.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm test:build-project
pnpm test:library
pnpm test:cache-security
pnpm exec tsc --noEmit
pnpm exec eslint components/build-project-actions.tsx lib/build-project app/api/build-project tests/build-project.test.ts tests/browser/build-project.spec.ts playwright.build.config.ts
pnpm exec playwright install chromium
pnpm test:build-browser
VIEWS_IP_SALT=local-build-test-value pnpm build --webpack
```

For a system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. Browser tests start localhost:3185, seed synthetic browser auth, intercept API responses, and block all non-local browser traffic. They test the UI behavior, not real Supabase login, model generation or GitHub writes. Unit tests mock all provider/GitHub calls, and independently parse generated ZIPs with Python's zipfile module.

Before enabling for anyone beyond an invited tester: complete an authorized real provider run, inspect/install/build the generated starter in a disposable sandbox, perform an authorized real GitHub export, verify the exact remote tree, replace process-local rate limiting with shared enforcement, and replace broad long-lived browser repo tokens. This branch does not claim those live checks passed.
