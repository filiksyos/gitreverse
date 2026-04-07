/**
 * Server-side combined fingerprint: merges request signals with client-side hash.
 */

import { createHash } from "crypto";
import { NextRequest } from "next/server";

/** Derive a combined fingerprint from server signals + client-provided hash. Returns null if X-Fingerprint header is missing. */
export function deriveFingerprint(request: NextRequest): string | null {
  const clientFp = request.headers.get("x-fingerprint");
  if (!clientFp) return null;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ua = request.headers.get("user-agent") ?? "";
  const lang = request.headers.get("accept-language") ?? "";

  return createHash("sha256")
    .update([ip, ua, lang, clientFp].join("|"))
    .digest("hex");
}
