import { callQuickLlm, resolveLlmTarget } from "@/lib/quick-llm";
import { appendDesignSystemLink } from "@/lib/website-prompt-utils";
import { buildWebsiteDesignSystemPrompt } from "@/lib/website-design-system-prompt";
import { WEBSITE_REVERSE_SYSTEM_PROMPT } from "@/lib/website-reverse-system-prompt";
import {
  evidenceStatusMessage,
  gatherWebsiteEvidence,
  type WebsiteEvidence,
} from "@/lib/website-scraper";
import {
  designApiPath,
  readWebsiteReverse,
  writeWebsiteReverse,
} from "@/lib/website-reverse-storage";

export type WebsiteReverseResult =
  | {
      ok: true;
      prompt: string;
      designMd: string;
      designPath: string;
      fromCache: boolean;
    }
  | { ok: false; error: string; status: number };

function buildDesignUserMessage(opts: {
  targetUrl: string;
  evidence: WebsiteEvidence;
}): string {
  const lines: string[] = [
    `# Target website`,
    ``,
    `URL: ${opts.targetUrl}`,
    opts.evidence.title ? `Title: ${opts.evidence.title}` : "",
    ``,
    `Evidence source: ${opts.evidence.source}`,
    ``,
  ];

  if (opts.evidence.source === "firecrawl" && opts.evidence.branding) {
    lines.push(
      `## Firecrawl branding JSON`,
      ``,
      "```json",
      JSON.stringify(opts.evidence.branding, null, 2),
      "```",
      ``
    );
  }

  if (opts.evidence.source === "context-dev") {
    if (opts.evidence.styleguide) {
      lines.push(
        `## Context.dev styleguide JSON`,
        ``,
        "```json",
        JSON.stringify(opts.evidence.styleguide, null, 2),
        "```",
        ``
      );
    }
    if (opts.evidence.brand) {
      lines.push(
        `## Context.dev brand JSON`,
        ``,
        "```json",
        JSON.stringify(opts.evidence.brand, null, 2),
        "```",
        ``
      );
    }
  }

  if (opts.evidence.screenshotUrl) {
    lines.push(`## Screenshot URL`, ``, opts.evidence.screenshotUrl, ``);
  }

  lines.push(`## Page markdown`, ``, opts.evidence.markdown || "*(empty)*");

  return lines
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

function buildReversePromptUserMessage(opts: {
  targetUrl: string;
  evidence: WebsiteEvidence;
  designMd: string;
}): string {
  const designSummary =
    opts.designMd.length > 2500
      ? `${opts.designMd.slice(0, 2500)}\n\n… (design.md truncated)`
      : opts.designMd;

  const tokenPayload =
    opts.evidence.source === "firecrawl"
      ? opts.evidence.branding
      : {
          styleguide: opts.evidence.styleguide,
          brand: opts.evidence.brand,
        };

  return [
    `# Target website`,
    ``,
    `URL: ${opts.targetUrl}`,
    opts.evidence.title ? `Title: ${opts.evidence.title}` : "",
    ``,
    `Evidence source: ${opts.evidence.source}`,
    ``,
    `## Design tokens JSON`,
    ``,
    "```json",
    JSON.stringify(tokenPayload, null, 2),
    "```",
    ``,
    opts.evidence.screenshotUrl
      ? `Screenshot URL: ${opts.evidence.screenshotUrl}\n`
      : "",
    `## Page markdown excerpt`,
    ``,
    opts.evidence.markdown.slice(0, 4000) || "*(empty)*",
    ``,
    `## Design system summary`,
    ``,
    designSummary,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

export async function ensureWebsiteReversed(opts: {
  slug: string;
  targetUrl: string;
  onStatus?: (message: string) => void;
  force?: boolean;
}): Promise<WebsiteReverseResult> {
  const { slug, targetUrl, onStatus, force } = opts;

  if (!force) {
    const cached = await readWebsiteReverse(slug);
    if (cached) {
      if (cached.meta.targetUrl !== targetUrl) {
        return { ok: false, error: "Website slug is already bound to a different URL.", status: 409 };
      }
      const prompt = appendDesignSystemLink(cached.meta.prompt, slug);
      if (prompt !== cached.meta.prompt) {
        // Heal stale design-system URLs in the cache (api → /designs, etc.)
        void writeWebsiteReverse({
          slug,
          targetUrl: cached.meta.targetUrl,
          designMd: cached.designMd,
          prompt,
        }).catch((e) => {
          console.warn(
            `[reverse-website] failed to heal design link for ${slug}:`,
            e instanceof Error ? e.message : e
          );
        });
      }
      return {
        ok: true,
        prompt,
        designMd: cached.designMd,
        designPath: designApiPath(slug),
        fromCache: true,
      };
    }
  }

  const requestStartedAt = Date.now();
  const llm = resolveLlmTarget();
  if ("error" in llm) {
    return { ok: false, error: llm.error, status: 500 };
  }

  onStatus?.("Visiting site");
  let evidence: WebsiteEvidence;
  const evidenceStartedAt = Date.now();
  try {
    evidence = await gatherWebsiteEvidence(targetUrl);
    onStatus?.(evidenceStatusMessage(evidence.source));
    console.log(
      `[reverse-website] evidence source=${evidence.source} elapsed=${Date.now() - evidenceStartedAt}ms`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(
      `[reverse-website] evidence FAILED after ${Date.now() - evidenceStartedAt}ms: ${msg}`
    );
    return { ok: false, error: msg, status: 502 };
  }

  onStatus?.("Understanding design");
  onStatus?.("Writing design.md");
  const designStartedAt = Date.now();
  const designResult = await callQuickLlm(
    llm,
    buildWebsiteDesignSystemPrompt(),
    buildDesignUserMessage({
      targetUrl,
      evidence,
    }),
    12_000
  );
  console.log(
    `[reverse-website] design.md elapsed=${Date.now() - designStartedAt}ms`
  );
  if (!designResult.ok) {
    return { ok: false, error: designResult.error, status: designResult.status };
  }

  onStatus?.("Reverse engineering prompt");
  const promptStartedAt = Date.now();
  const promptResult = await callQuickLlm(
    llm,
    WEBSITE_REVERSE_SYSTEM_PROMPT,
    buildReversePromptUserMessage({
      targetUrl,
      evidence,
      designMd: designResult.text,
    }),
    4096
  );
  console.log(
    `[reverse-website] prompt elapsed=${Date.now() - promptStartedAt}ms`
  );
  if (!promptResult.ok) {
    return { ok: false, error: promptResult.error, status: promptResult.status };
  }

  const finalPrompt = appendDesignSystemLink(promptResult.text, slug);
  console.log(
    `[reverse-website] TOTAL elapsed=${Date.now() - requestStartedAt}ms`
  );

  try {
    await writeWebsiteReverse({
      slug,
      targetUrl,
      designMd: designResult.text,
      prompt: finalPrompt,
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
    designMd: designResult.text,
    designPath: designApiPath(slug),
    fromCache: false,
  };
}
