import assert from "node:assert/strict";
import test from "node:test";
import { appendGameSpecLink } from "../lib/game-prompt-utils";
import { appendHeroAssetInstructions } from "../lib/game-hero-assets";
import type { StoredHeroAsset } from "../lib/game-asset-storage";

test("appendGameSpecLink writes a single bare spec URL", () => {
  const mangled = `Build Delta Force.

Use this game spec: http://localhost:3000/specs/delta-forc (http://localhost:3000/specs/delta-force)e`;
  const out = appendGameSpecLink(mangled, "delta-force");
  const lines = out.split("\n").filter((line) => line.startsWith("Use this game spec:"));
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /^Use this game spec: https?:\/\/\S+$/);
  assert.match(lines[0] ?? "", /\/specs\/delta-force$/);
  assert.doesNotMatch(lines[0] ?? "", /\(/);
  assert.doesNotMatch(out, /delta-forc \(/);
});

test("empty hero assets still append kernel and download instructions", () => {
  const out = appendHeroAssetInstructions("Make a vertical slice.", "delta-force", []);
  assert.match(out, /Download these 3D models into public\/models\//);
  assert.match(out, /Idle_Loop/);
  assert.match(out, /Walk_Loop/);
  assert.match(out, /UAL1_Standard/);
  assert.match(out, /AnimationMixer/);
});

test("generated hero assets keep real GLB URLs plus kernel clips", () => {
  const assets: StoredHeroAsset[] = [
    {
      id: "player",
      filename: "player.glb",
      kind: "humanoid",
      rigged: true,
      hasWalk: true,
      prompt: "soldier",
      kernel: "quaternius-ual1",
      clips: ["Idle_Loop", "Walk_Loop"],
    },
  ];
  const out = appendHeroAssetInstructions("Make a vertical slice.", "delta-force", assets);
  assert.match(out, /player\.glb/);
  assert.match(out, /\/api\/game-assets\/delta-force\/player\.glb/);
  assert.match(out, /Idle_Loop/);
  assert.match(out, /Walk_Loop/);
});
