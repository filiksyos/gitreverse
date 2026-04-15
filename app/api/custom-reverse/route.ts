import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CUSTOM_REVERSE_URL = "http://localhost:3001";

function getServiceUrl(): string {
  return (
    process.env.CUSTOM_REVERSE_SERVICE_URL?.trim() || DEFAULT_CUSTOM_REVERSE_URL
  );
}

/** Comma-separated invite codes (trimmed, empty segments skipped). */
function parseInviteCodes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Case-insensitive match; uses timing-safe compare when lengths align with a candidate. */
function isValidInviteCode(
  submitted: string,
  validCodes: string[]
): boolean {
  const t = submitted.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  const lowerBuf = Buffer.from(lower, "utf8");
  for (const code of validCodes) {
    const c = code.trim();
    if (!c) continue;
    if (c.length !== t.length) continue;
    const candLower = c.toLowerCase();
    if (candLower.length !== lower.length) continue;
    const candBuf = Buffer.from(candLower, "utf8");
    if (lowerBuf.length !== candBuf.length) continue;
    try {
      if (timingSafeEqual(lowerBuf, candBuf)) return true;
    } catch {
      /* length mismatch — skip */
    }
  }
  return false;
}

/** Long-running upstream request; allow up to 10 minutes. */
const FETCH_TIMEOUT_MS = 600_000;

export async function POST(request: NextRequest) {
  let body: { repoUrl?: string; customPrompt?: string; inviteCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const codes = parseInviteCodes(process.env.CUSTOM_REVERSE_INVITE_CODES);

  if (isProduction() && codes.length === 0) {
    return NextResponse.json(
      {
        error:
          "Custom reverse (beta) is not available. The host has not configured invite access.",
      },
      { status: 503 }
    );
  }

  if (codes.length > 0) {
    const inviteCode =
      typeof body.inviteCode === "string" ? body.inviteCode : "";
    if (!isValidInviteCode(inviteCode, codes)) {
      return NextResponse.json(
        { error: "Invalid or missing invite code." },
        { status: 403 }
      );
    }
  }

  const repoUrl = body.repoUrl;
  const customPrompt = body.customPrompt;

  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    return NextResponse.json(
      { error: "repoUrl is required (string)" },
      { status: 400 }
    );
  }
  if (typeof customPrompt !== "string" || !customPrompt.trim()) {
    return NextResponse.json(
      { error: "customPrompt is required (string)" },
      { status: 400 }
    );
  }

  const base = getServiceUrl().replace(/\/$/, "");

  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      res = await fetch(`${base}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), customPrompt: customPrompt.trim() }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? "Custom reverse timed out. Try a smaller repo or a narrower prompt."
          : `Custom reverse service unreachable (${msg}). Check CUSTOM_REVERSE_SERVICE_URL and that the service is running.`,
      },
      { status: 503 }
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Custom reverse service returned invalid JSON." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const err =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    return NextResponse.json({ error: err }, { status: res.status >= 400 && res.status < 600 ? res.status : 502 });
  }

  const prompt =
    data &&
    typeof data === "object" &&
    "prompt" in data &&
    typeof (data as { prompt: unknown }).prompt === "string"
      ? (data as { prompt: string }).prompt
      : null;

  if (!prompt) {
    return NextResponse.json(
      { error: "Custom reverse service did not return a prompt." },
      { status: 502 }
    );
  }

  return NextResponse.json({ prompt }, { status: 200 });
}
