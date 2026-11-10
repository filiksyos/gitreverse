export function parseInstagramReel(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!["instagram.com", "www.instagram.com", "m.instagram.com"].includes(url.hostname)) return null;
    return /^\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isInstagramMediaUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net"));
  } catch {
    return false;
  }
}
