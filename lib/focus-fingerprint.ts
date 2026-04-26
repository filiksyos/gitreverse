import { createHash } from "node:crypto";

/** UTF-8 formatındaki focus öğesinin MD5 onaltılık değeri — Postgres’teki `md5(focus::text)` ile eşleşmelidir (`focus_fingerprint`). */
export function focusFingerprint(focus: string): string {
  return createHash("md5").update(focus, "utf8").digest("hex");
}

/** Deep Reverse için akış / önbellek anahtarı. */
export const DEEP_REVERSE_FOCUS = "[deep] whole codebase";
