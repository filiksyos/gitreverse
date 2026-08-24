import type { LlmTarget } from "@/lib/quick-llm";
import { callQuickLlm } from "@/lib/quick-llm";
import { generateTexturedGlb, getMeshyApiKey } from "@/lib/meshy-client";
import { autoRigToQuaterniusKernel } from "@/lib/auto-rig-humanoid";
import {
  QUATERNIUS_KERNEL_ID,
  QUATERNIUS_ROOT_MOTION_PUBLIC_PATH,
  QUATERNIUS_STANDARD_PUBLIC_PATH,
} from "@/lib/quaternius-kernel";
import {
  type StoredHeroAsset,
  writeGameAssetFile,
  writeHeroAssetManifest,
} from "@/lib/game-asset-storage";
import { gameAssetFileUrl, getSiteBaseUrl } from "@/lib/site-url";

export type HeroAssetKind = "humanoid" | "vehicle" | "prop";

type PlannedAsset = {
  id: string;
  kind: HeroAssetKind;
  prompt: string;
};

const ASSET_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const GENERATED_SECTION_RE =
  /\n*## 10\. Generated hero assets[\s\S]*$/i;

function parseJsonObject(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return JSON.parse(trimmed.slice(start, end + 1));
}

function sanitizeId(raw: string, fallback: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return ASSET_ID_RE.test(slug) ? slug : fallback;
}

export function stripGeneratedAssetsSection(specMd: string): string {
  return specMd.replace(GENERATED_SECTION_RE, "").trimEnd();
}

export function appendGeneratedAssetsSection(
  specMd: string,
  slug: string,
  assets: StoredHeroAsset[]
): string {
  const base = stripGeneratedAssetsSection(specMd);
  if (!assets.length) return base;

  const rows = assets
    .map((asset) => {
      const note = asset.kernel
        ? "Quaternius Universal kernel (Idle_Loop, Walk_Loop, Sprint_Loop, …)"
        : asset.hasWalk
          ? "rigged walk clip"
          : asset.rigged
            ? "rigged"
            : "textured sculpt";
      return `| ${asset.id} | \`${asset.filename}\` | ${gameAssetFileUrl(slug, asset.filename)} | ${note} |`;
    })
    .join("\n");

  const kernelHint = assets.some((a) => a.kernel)
    ? `
- Clips are already embedded. Drive them with Three.js \`AnimationMixer\` using these names: \`Idle_Loop\`, \`Walk_Loop\`, \`Jog_Fwd_Loop\`, \`Sprint_Loop\`, \`Jump_Start\` / \`Jump_Loop\` / \`Jump_Land\`, \`Punch_Jab\`, \`Sword_Attack\`, \`Death01\`.
- Do not T-pose, invent keyframes, or replace the hero with boxes.
- In-place locomotion is baked in. For traveling root motion, also load \`${getSiteBaseUrl()}${QUATERNIUS_ROOT_MOTION_PUBLIC_PATH}\` (same bone names).
`
    : `
- Play the walk clip on humanoid heroes while moving. Pause it when idle.
`;

  return `${base}

## 10. Generated hero assets

These GLBs were sculpted for this slice. Download them into \`public/models/\` and load with Three.js \`GLTFLoader\`. Do **not** replace them with boxes or capsules.

| id | file | download | notes |
| --- | --- | --- | --- |
${rows}

${kernelHint.trim()}
- Keep buildings, roads, and repeating world dressing procedural.
`;
}

export function appendHeroAssetInstructions(
  prompt: string,
  slug: string,
  assets: StoredHeroAsset[]
): string {
  if (!assets.length) return prompt;
  const lines = assets.map((asset) => {
    const extra = asset.kernel
      ? " (Quaternius Universal rig; play Idle_Loop / Walk_Loop / Sprint_Loop — do not T-pose)"
      : asset.hasWalk
        ? " (rigged; play the walk animation while moving)"
        : "";
    return `- ${asset.filename}${extra}: ${gameAssetFileUrl(slug, asset.filename)}`;
  });
  const kernelLine = assets.some((a) => a.kernel)
    ? `\nClip names: Idle_Loop (stand), Walk_Loop (move), Jog_Fwd_Loop, Sprint_Loop (run), Jump_Start then Jump_Loop then Jump_Land, Punch_Jab / Punch_Cross, Sword_Attack, Death01. Use AnimationMixer. Optional traveling locomotion: ${getSiteBaseUrl()}${QUATERNIUS_ROOT_MOTION_PUBLIC_PATH} (same skeleton). In-place kernel copy: ${getSiteBaseUrl()}${QUATERNIUS_STANDARD_PUBLIC_PATH}.`
    : "";
  const block = `Download these 3D models into public/models/ and load them with GLTFLoader. Do not rebuild these heroes from boxes.\n${lines.join("\n")}${kernelLine}`;
  const stripped = prompt
    .replace(
      /\n*Download these 3D models into public\/models\/[\s\S]*?(?=\n\nUse this game spec:|$)/i,
      ""
    )
    .trimEnd();
  return `${stripped}\n\n${block}`;
}

async function planHeroAssets(opts: {
  llm: LlmTarget;
  gameName: string;
  specMd: string;
}): Promise<PlannedAsset[]> {
  const result = await callQuickLlm(
    opts.llm,
    `You pick 3D hero assets for a browser game vertical slice. Reply with JSON only:
{"skip":false,"assets":[{"id":"player","kind":"humanoid","prompt":"..."}]}
Rules:
- skip=true for 2D, sprite, canvas-only, text, or first-person games with no visible body.
- skip=false for third-person, over-shoulder, board armies, hero vehicles the camera follows, or any on-camera character.
- 1 or 2 assets max. Prefer the player/army first, then one signature vehicle if the camera sits on it.
- kind is humanoid, vehicle, or prop.
- id is a short slug like player, car, knight.
- prompt is a Meshy text-to-3D prompt: one object, full body or full vehicle, T-pose if humanoid, no scene, no extra people, readable game-ready sculpt.
- Do not request buildings, trees, or a whole city.`,
    `Game: ${opts.gameName}\n\nGAME.md:\n${opts.specMd.slice(0, 6000)}`,
    800
  );

  if (!result.ok) return heuristicPlan(opts.gameName, opts.specMd);

  try {
    const parsed = parseJsonObject(result.text) as {
      skip?: boolean;
      assets?: Array<{ id?: string; kind?: string; prompt?: string }>;
    };
    if (parsed?.skip) return [];
    const used = new Set<string>();
    const assets = (parsed?.assets ?? [])
      .slice(0, 2)
      .map((asset, i) => {
        const kind =
          asset.kind === "vehicle" || asset.kind === "prop" || asset.kind === "humanoid"
            ? asset.kind
            : "humanoid";
        let id = sanitizeId(asset.id ?? "", i === 0 ? "player" : `hero-${i + 1}`);
        if (used.has(id)) id = sanitizeId(`${id}-${i + 1}`, `hero-${i + 1}`);
        used.add(id);
        const prompt = (asset.prompt ?? "").trim();
        if (!prompt) return null;
        return { id, kind, prompt } satisfies PlannedAsset;
      })
      .filter((asset): asset is PlannedAsset => Boolean(asset));
    return assets;
  } catch {
    return heuristicPlan(opts.gameName, opts.specMd);
  }
}

function heuristicPlan(gameName: string, specMd: string): PlannedAsset[] {
  const is2d =
    /\b(canvas 2d|sprite sheet|side scroll|2d platform)/i.test(specMd) &&
    !/three\.js/i.test(specMd);
  const firstPerson = /first person|cockpit/i.test(specMd) && !/third person/i.test(specMd);
  if (is2d || firstPerson) return [];
  const wants3d =
    /three\.js|third person|over-shoulder|hero mesh|identity object/i.test(specMd);
  if (!wants3d) return [];
  return [
    {
      id: "player",
      kind: "humanoid",
      prompt: `A single full-body game character from ${gameName}, standing in T-pose, arms straight out to the sides, readable silhouette, detailed clothes, no weapons in hand, no background, no other people, game-ready sculpt`,
    },
  ];
}

export async function generateHeroAssets(opts: {
  llm: LlmTarget;
  slug: string;
  gameName: string;
  specMd: string;
  deadlineAt?: number;
  onStatus?: (message: string) => void;
}): Promise<StoredHeroAsset[]> {
  const apiKey = getMeshyApiKey();
  if (!apiKey) {
    opts.onStatus?.("Skipping 3D sculpt (no Meshy key)");
    return [];
  }

  opts.onStatus?.("Planning hero meshes");
  const plan = await planHeroAssets({
    llm: opts.llm,
    gameName: opts.gameName,
    specMd: opts.specMd,
  });
  if (!plan.length) return [];

  const assets: StoredHeroAsset[] = [];
  for (const item of plan) {
    if (opts.deadlineAt && opts.deadlineAt - Date.now() < 20_000) {
      console.warn(`[game-assets] ${item.id} skipped: not enough time left`);
      break;
    }
    const sculpt = await generateTexturedGlb({
      apiKey,
      prompt: item.prompt,
      poseMode: item.kind === "humanoid" ? "t-pose" : "",
      deadlineAt: opts.deadlineAt,
      onStatus: opts.onStatus,
    });
    if (!sculpt.ok) {
      console.warn(`[game-assets] ${item.id} sculpt failed: ${sculpt.error}`);
      continue;
    }

    let bytes = sculpt.glb;
    let rigged = false;
    let hasWalk = false;
    let kernel: StoredHeroAsset["kernel"] = null;
    let clips: string[] = [];
    if (item.kind === "humanoid") {
      opts.onStatus?.("Auto-rigging Quaternius kernel");
      const rig = await autoRigToQuaterniusKernel(sculpt.glb);
      if (rig.ok) {
        bytes = rig.glb;
        rigged = true;
        hasWalk = rig.clips.includes("Walk_Loop");
        kernel = QUATERNIUS_KERNEL_ID;
        clips = rig.clips;
        opts.onStatus?.("Quaternius kernel bound (Idle_Loop / Walk_Loop)");
      } else {
        console.warn(`[game-assets] ${item.id} auto-rig failed: ${rig.error}`);
      }
    }

    const filename = `${item.id}.glb`;
    try {
      await writeGameAssetFile(opts.slug, filename, bytes);
      assets.push({
        id: item.id,
        filename,
        kind: item.kind,
        rigged,
        hasWalk,
        prompt: item.prompt,
        kernel,
        clips,
      });
    } catch (e) {
      console.warn(
        `[game-assets] ${item.id} save failed:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  if (assets.length) {
    await writeHeroAssetManifest(opts.slug, { assets });
  }
  return assets;
}
