import { gameSpecPageUrl } from "@/lib/site-url";

const GAME_SPEC_SUFFIX_RE =
  /\n*Use this game spec:\s*(?:\[[^\]]*\]\([^)]+\)|https?:\/\/\S+)\s*$/i;

export function stripGameSpecLink(prompt: string): string {
  return prompt.replace(GAME_SPEC_SUFFIX_RE, "").trimEnd();
}

export function appendGameSpecLink(prompt: string, slug: string): string {
  const stripped = stripGameSpecLink(prompt);
  const link = gameSpecPageUrl(slug);
  const suffix = `Use this game spec: ${link}`;
  if (stripped.includes(suffix)) return stripped;
  return `${stripped}\n\n${suffix}`;
}
