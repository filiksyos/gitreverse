# GitReverse

https://github.com/user-attachments/assets/f0cdb7b2-c6f0-4483-8a01-153170479f2e

Turn a **public GitHub repository** into a **single synthetic user prompt** that someone might paste into Cursor, Claude Code, Codex, etc. to vibe code the project from scratch.

The app pulls **repo metadata**, a **root file tree** (depth 1), and the **README**, then uses an LLM via [OpenRouter](https://openrouter.ai/) to produce one short, conversational prompt grounded in that context.

Paste a GitHub URL or `owner/repo` on the home page. You can also open **`/owner/repo`** (e.g. `/vercel/next.js`) for a shareable link that runs the same flow.

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS, GitHub API, OpenRouter.

## Configuration

Copy `.env.example` to `.env.local`. You need **`OPENROUTER_API_KEY`**. Optional: `OPENROUTER_MODEL` (defaults to `google/gemini-2.5-pro`), `GITHUB_TOKEN` for better GitHub rate limits, and Supabase env vars from the example file if you want server-side caching.

### Custom reverse (optional, beta)

For **deep / focus** prompts, run the **custom_reverse** service (separate TypeScript project; see its `README`; `pnpm dev`, default port **3001**) locally or deploy it to your own backend. In `.env.local` set:

`CUSTOM_REVERSE_SERVICE_URL=http://localhost:3001`

**Invite-only access:** Set `CUSTOM_REVERSE_INVITE_CODES` to a comma-separated list of opaque strings (e.g. `alpha-2026,beta-friend-02`). On Vercel, add the same variable in Project Settings → Environment Variables, then redeploy. Without codes in **production**, Custom reverse returns an error (the feature stays off until configured). In **local development**, you can omit `CUSTOM_REVERSE_INVITE_CODES` to skip the invite gate while testing.

Then enable **Custom reverse** on the home page (you will be prompted for an invite code), and describe what to reverse-engineer.

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

Shout out to [GitIngest](http://github.com/coderamp-labs/gitingest) for inspiration.
