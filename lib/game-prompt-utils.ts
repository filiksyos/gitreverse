import { gameSpecPageUrl } from "@/lib/site-url";

const GAME_SPEC_SUFFIX_RE = /(?:\n+Use this game spec:[^\n]*)+$/i;

export function stripGameSpecLink(prompt: string): string {
  return prompt.replace(GAME_SPEC_SUFFIX_RE, "").trimEnd();
}

export function appendGameSpecLink(prompt: string, slug: string): string {
  const stripped = stripGameSpecLink(prompt);
  const link = gameSpecPageUrl(slug);
  return `${stripped}\n\nUse this game spec: ${link}`;
}
