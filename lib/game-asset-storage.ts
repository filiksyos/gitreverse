import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GAME_ASSETS_BUCKET = "game-assets";

function diskDir(slug: string): string {
  return path.join(process.cwd(), "data", "game-assets", slug);
}

export function isSafeAssetFilename(filename: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}\.glb$/i.test(filename);
}

export type StoredHeroAsset = {
  id: string;
  filename: string;
  kind: "humanoid" | "vehicle" | "prop";
  rigged: boolean;
  hasWalk: boolean;
  prompt: string;
  kernel?: "quaternius-ual1" | null;
  clips?: string[];
};

export type HeroAssetManifest = {
  assets: StoredHeroAsset[];
};

export async function writeGameAssetFile(
  slug: string,
  filename: string,
  bytes: Buffer
): Promise<void> {
  const dir = diskDir(slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.storage
    .from(GAME_ASSETS_BUCKET)
    .upload(`${slug}/${filename}`, bytes, {
      contentType: "model/gltf-binary",
      upsert: true,
    });
  if (error) {
    console.warn(
      `[game-assets] supabase upload skipped for ${slug}/${filename}: ${error.message}`
    );
  }
}

export async function writeHeroAssetManifest(
  slug: string,
  manifest: HeroAssetManifest
): Promise<void> {
  const dir = diskDir(slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "assets.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.storage
    .from(GAME_ASSETS_BUCKET)
    .upload(`${slug}/assets.json`, JSON.stringify(manifest), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    console.warn(
      `[game-assets] supabase manifest skipped for ${slug}: ${error.message}`
    );
  }
}

export async function readGameAssetFile(
  slug: string,
  filename: string
): Promise<Buffer | null> {
  try {
    return await readFile(path.join(diskDir(slug), filename));
  } catch {
    // fall through to supabase
  }

  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(GAME_ASSETS_BUCKET)
    .download(`${slug}/${filename}`);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function readHeroAssetManifest(
  slug: string
): Promise<HeroAssetManifest | null> {
  try {
    const raw = await readFile(path.join(diskDir(slug), "assets.json"), "utf8");
    const parsed = JSON.parse(raw) as HeroAssetManifest;
    if (Array.isArray(parsed.assets)) return parsed;
  } catch {
    // fall through
  }

  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(GAME_ASSETS_BUCKET)
    .download(`${slug}/assets.json`);
  if (error || !data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as HeroAssetManifest;
    if (Array.isArray(parsed.assets)) return parsed;
  } catch {
    return null;
  }
  return null;
}
