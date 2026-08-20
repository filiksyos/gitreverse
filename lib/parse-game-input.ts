const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LEN = 80;
const MAX_NAME_LEN = 120;

function looksLikeUrl(raw: string): boolean {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return true;
  if (/^github\.com\//i.test(s)) return true;
  if (/^www\./i.test(s)) return true;
  if (/\.[a-z]{2,}(\/|$)/i.test(s) && !s.includes(" ")) return true;
  return false;
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LEN);
}

export function parseGameInput(
  raw: string
): { name: string; slug: string } | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LEN) return null;
  if (looksLikeUrl(name)) return null;

  const slug = nameToSlug(name);
  if (!slug || slug.length < 2) return null;

  return { name, slug };
}

export function isValidGameSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s || s.length > MAX_SLUG_LEN) return false;
  return SLUG_SEGMENT.test(s);
}
