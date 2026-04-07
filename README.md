# GitReverse

https://github.com/user-attachments/assets/f0cdb7b2-c6f0-4483-8a01-153170479f2e

Turn a **public GitHub repository** into a **single synthetic user prompt** that someone might paste into Cursor, Claude Code, Codex, etc. to vibe code the project from scratch.

The app pulls **repo metadata**, a **root file tree** (depth 1), and the **README**, then uses an LLM via [OpenRouter](https://openrouter.ai/) to produce one short, conversational prompt grounded in that context.

Paste a GitHub URL or `owner/repo` on the home page. You can also open **`/owner/repo`** (e.g. `/vercel/next.js`) for a shareable link that runs the same flow.

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS, GitHub API, OpenRouter.

## Deep Reverse

**Deep Reverse** is an optional mode that produces a detailed, comprehensive prompt (2000–4000 words) by combining [DeepWiki](https://deepwiki.com/) documentation analysis with LLM synthesis. The pipeline:

1. Fetches the repository's wiki structure from DeepWiki (MCP API)
2. An LLM selects 1–5 key documentation sections to examine
3. Fetches full wiki documentation and extracts the selected sections
4. An LLM synthesizes everything into one actionable prompt

Deep Reverse is **rate-limited** (3 uses per week per browser fingerprint) and **gradually rolled out** via `DEEP_REVERSE_ROLLOUT_PERCENT`. It requires Supabase for caching and rate tracking. Results are cached separately in `deep_prompt_cache`.

If a repository has not been indexed by DeepWiki, the request is declined and the usage attempt is refunded.

## Configuration

Copy `.env.example` to `.env.local`. You need **`OPENROUTER_API_KEY`**. Optional: `OPENROUTER_MODEL` (defaults to `google/gemini-2.5-pro`), `GITHUB_TOKEN` for better GitHub rate limits, and Supabase env vars from the example file if you want server-side caching.

### Deep Reverse env vars (optional)

| Variable | Default | Description |
|---|---|---|
| `DEEP_REVERSE_ROLLOUT_PERCENT` | `50` | Percentage of browser fingerprints that see the Deep Reverse toggle (0–100) |
| `DEEP_REVERSE_MAX_USES_PER_WEEK` | `3` | Deep reverse uses per fingerprint per week |
| `DEEP_CACHE_TTL_HOURS` | `168` | How long deep prompts are cached (default 7 days) |
| `DEEPWIKI_MCP_URL` | `https://mcp.deepwiki.com/mcp` | DeepWiki MCP endpoint override |

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

Pull requests are appreciated!