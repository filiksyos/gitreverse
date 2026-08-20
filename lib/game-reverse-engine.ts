import { callQuickLlm, resolveLlmTarget } from "@/lib/quick-llm";
import { appendGameSpecLink } from "@/lib/game-prompt-utils";
import { buildGameSpecSystemPrompt } from "@/lib/game-spec-system-prompt";
import { GAME_REVERSE_SYSTEM_PROMPT } from "@/lib/game-reverse-system-prompt";
import {
  evidenceStatusMessage,
  gatherGameEvidence,
  type GameEvidence,
} from "@/lib/game-evidence";
import {
  readGameReverse,
  specApiPath,
  writeGameReverse,
} from "@/lib/game-reverse-storage";

export type GameReverseResult =
  | {
      ok: true;
      prompt: string;
      specMd: string;
      specPath: string;
      fromCache: boolean;
    }
  | { ok: false; error: string; status: number };

function buildSpecUserMessage(opts: {
  gameName: string;
  evidence: GameEvidence;
}): string {
  const lines: string[] = [
    `# Target game`,
    ``,
    `Title: ${opts.gameName}`,
    `Slug: ${opts.evidence.slug}`,
    ``,
    `Evidence source: ${opts.evidence.source}`,
    ``,
  ];

  if (opts.evidence.metadata && Object.keys(opts.evidence.metadata).length > 0) {
    lines.push(
      `## External metadata JSON`,
      ``,
      "```json",
      JSON.stringify(opts.evidence.metadata, null, 2),
      "```",
      ``
    );
  }

  lines.push(
    `## Notes`,
    ``,
    opts.evidence.source === "name-only"
      ? "No external evidence. Use well known facts about this game and scope a honest browser vertical slice."
      : "Prefer external metadata when present."
  );

  return lines.join("\n");
}

function buildReversePromptUserMessage(opts: {
  gameName: string;
  evidence: GameEvidence;
  specMd: string;
}): string {
  const specSummary =
    opts.specMd.length > 2500
      ? `${opts.specMd.slice(0, 2500)}\n\n… (GAME.md truncated)`
      : opts.specMd;

  return [
    `# Target game`,
    ``,
    `Title: ${opts.gameName}`,
    `Slug: ${opts.evidence.slug}`,
    ``,
    `Evidence source: ${opts.evidence.source}`,
    ``,
    opts.evidence.metadata
      ? `## Metadata JSON\n\n\`\`\`json\n${JSON.stringify(opts.evidence.metadata, null, 2)}\n\`\`\`\n`
      : "",
    `## GAME.md summary`,
    ``,
    specSummary,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

export async function ensureGameReversed(opts: {
  slug: string;
  gameName: string;
  onStatus?: (message: string) => void;
  force?: boolean;
}): Promise<GameReverseResult> {
  const { slug, gameName, onStatus, force } = opts;

  if (!force) {
    const cached = await readGameReverse(slug);
    if (cached) {
      const prompt = appendGameSpecLink(cached.meta.prompt, slug);
      if (prompt !== cached.meta.prompt) {
        void writeGameReverse({
          slug,
          gameName: cached.meta.gameName,
          specMd: cached.specMd,
          prompt,
        }).catch((e) => {
          console.warn(
            `[reverse-game] failed to heal spec link for ${slug}:`,
            e instanceof Error ? e.message : e
          );
        });
      }
      return {
        ok: true,
        prompt,
        specMd: cached.specMd,
        specPath: specApiPath(slug),
        fromCache: true,
      };
    }
  }

  const requestStartedAt = Date.now();
  const llm = resolveLlmTarget();
  if ("error" in llm) {
    return { ok: false, error: llm.error, status: 500 };
  }

  onStatus?.("Recalling game");
  let evidence: GameEvidence;
  const evidenceStartedAt = Date.now();
  try {
    evidence = await gatherGameEvidence({ name: gameName, slug });
    onStatus?.(evidenceStatusMessage(evidence.source));
    console.log(
      `[reverse-game] evidence source=${evidence.source} elapsed=${Date.now() - evidenceStartedAt}ms`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(
      `[reverse-game] evidence FAILED after ${Date.now() - evidenceStartedAt}ms: ${msg}`
    );
    return { ok: false, error: msg, status: 502 };
  }

  onStatus?.("Understanding mechanics");
  onStatus?.("Writing GAME.md");
  const specStartedAt = Date.now();
  const specResult = await callQuickLlm(
    llm,
    buildGameSpecSystemPrompt(),
    buildSpecUserMessage({ gameName, evidence }),
    12_000
  );
  console.log(
    `[reverse-game] GAME.md elapsed=${Date.now() - specStartedAt}ms`
  );
  if (!specResult.ok) {
    return { ok: false, error: specResult.error, status: specResult.status };
  }

  onStatus?.("Reverse engineering prompt");
  const promptStartedAt = Date.now();
  const promptResult = await callQuickLlm(
    llm,
    GAME_REVERSE_SYSTEM_PROMPT,
    buildReversePromptUserMessage({
      gameName,
      evidence,
      specMd: specResult.text,
    }),
    4096
  );
  console.log(
    `[reverse-game] prompt elapsed=${Date.now() - promptStartedAt}ms`
  );
  if (!promptResult.ok) {
    return { ok: false, error: promptResult.error, status: promptResult.status };
  }

  const finalPrompt = appendGameSpecLink(promptResult.text, slug);
  console.log(`[reverse-game] TOTAL elapsed=${Date.now() - requestStartedAt}ms`);

  try {
    await writeGameReverse({
      slug,
      gameName,
      specMd: specResult.text,
      prompt: finalPrompt,
      metadata: evidence.metadata ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Failed to save cache: ${msg}`,
      status: 500,
    };
  }

  return {
    ok: true,
    prompt: finalPrompt,
    specMd: specResult.text,
    specPath: specApiPath(slug),
    fromCache: false,
  };
}
