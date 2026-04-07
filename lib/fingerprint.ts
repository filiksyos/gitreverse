/**
 * Client-side browser fingerprint for anonymous session tracking.
 * Combines stable browser signals into a SHA-256 hash.
 */

export async function generateFingerprint(): Promise<string> {
  const signals = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
    String(screen.colorDepth ?? 0),
  ].join("|");

  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(signals)
  );

  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
