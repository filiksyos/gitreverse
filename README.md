# GitReverse

https://github.com/user-attachments/assets/f0cdb7b2-c6f0-4483-8a01-153170479f2e

Turn a **public GitHub repository** into a **single synthetic user prompt** that someone might paste into Cursor, Claude Code, Codex, etc. to vibe code the project from scratch.

The app pulls **repo metadata**, a **root file tree** (depth 1), and the **README**, then uses an LLM to produce one short, conversational prompt grounded in that context.

Paste a GitHub URL or `owner/repo` on the home page. You can also open **`/owner/repo`** (e.g. `/vercel/next.js`) for a shareable link that runs the same flow.

GitHub-style **`/owner/repo/tree/...`** URLs on this site **redirect to `/owner/repo`** so they do not 404. The reverse flow still uses the whole repo for now; **subfolder-aware** context (scoped to that path) is planned for a later change.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, GitHub API, Supabase (optional), Stripe (optional).

## Configuration

Copy `.env.example` to `.env.local` and fill in at least one LLM API key.

### Quick LLM (required)

The quick reverse endpoint supports five providers. Set **`GITREVERSE_QUICK_LLM`** to pin one, or leave it unset (`auto`) to let the app use whichever key it finds first:

| Provider | Key env var | Model env var | Default model |
|---|---|---|---|
| Grok (xAI) | `XAI_API_KEY` | `XAI_MODEL` | `grok-3` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `google/gemini-2.5-pro` |
| OrcaRouter | `ORCAROUTER_API_KEY` | `ORCAROUTER_MODEL` | `anthropic/claude-sonnet-5` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` | `AZURE_OPENAI_MODEL` | `gpt-5.4` |
| Google AI Studio | `GOOGLE_GENERATIVE_AI_API_KEY` | `GOOGLE_AI_STUDIO_MODEL` | `gemini-2.5-pro` |

In `auto` mode the order of preference is: Grok → OpenRouter → OrcaRouter → Azure → Google.

[OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible gateway that also runs gateway-level, zero-trust security for AI agents on the same endpoint — screening every prompt/response and governing every tool call on a default-deny basis, with no application code changes. Its model ids are namespaced (e.g. `anthropic/claude-sonnet-5`), so the default above uses one.

Azure quick reverse uses `gpt-5.4` by default with `AZURE_OPENAI_REASONING_EFFORT=medium`. Title generation also uses Azure and defaults to `gpt-5.4-mini` with reasoning disabled.

### Embeddings / library search

Prompt-cache embeddings and `/library` hybrid search now use Azure embeddings first:

- **`AZURE_OPENAI_EMBEDDING_MODEL`** — defaults to `text-embedding-3-small`
- **`AZURE_OPENAI_EMBEDDING_DIMENSIONS`** — defaults to `512`
- **`AZURE_OPENAI_EMBEDDING_DEPLOYMENT`** — optional explicit deployment name
- **`AZURE_OPENAI_DEPLOYMENT_NAME_MAP`** — optional `model=deployment` mapping when deployment names differ from model ids

If your Azure resource does not yet have an embedding deployment, you can temporarily set **`OPENAI_API_KEY`** as an embedding-only fallback while quick reverse and title generation stay on Azure.

### Other env vars

- **`GITHUB_TOKEN`** — optional; increases GitHub API rate limits.
- **`SUPABASE_URL`** + **`SUPABASE_PUBLISHABLE_KEY`** — optional; enables server-side caching of quick prompts in `prompt_cache` and exposes the `/library` page.
- **`VIEWS_IP_SALT`** — **required in production**. Generate one with `openssl rand -hex 32`. The app will refuse to start in production without a non-default value.

## Routes

| Path | Description |
|---|---|
| `/` | Home — quick reverse (codebase or website) |
| `/library` | Browse cached quick prompts (requires Supabase) |
| `/history` | Your prompt history (profile menu when signed in; syncs to Supabase) |
| `/[owner]/[repo]` | Shareable quick-reverse link |
| `/[owner]/[repo]/tree/...` | Redirects to `/[owner]/[repo]` |

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
pnpm build
pnpm start
pnpm lint
```

<!-- GitAds-Verify: QL21GOFX8CJONRKJCB9MHXMCF4ZIHRHF -->
