import assert from "node:assert/strict";
import test from "node:test";
import {
  httpsUrl,
  mergeHeroProgress,
  meshyTaskSnapshot,
  parseHeroProgressEvent,
  type HeroProgressEvent,
} from "../lib/meshy-progress";

test("meshyTaskSnapshot streams status and percent without inventing URLs", () => {
  assert.deepEqual(
    meshyTaskSnapshot({ status: "IN_PROGRESS", progress: 41 }),
    { status: "IN_PROGRESS", progress: 41 }
  );
  assert.equal(
    meshyTaskSnapshot({
      status: "IN_PROGRESS",
      progress: 80,
      model_urls: { glb: "https://assets.meshy.ai/output/model.glb" },
    }).glbUrl,
    undefined
  );
});

test("meshyTaskSnapshot only exposes result URLs after SUCCEEDED", () => {
  const snap = meshyTaskSnapshot({
    status: "SUCCEEDED",
    progress: 100,
    thumbnail_url: "https://assets.meshy.ai/output/preview.png",
    alpha_thumbnail_url: "https://assets.meshy.ai/output/preview-alpha.png",
    model_urls: { glb: "https://assets.meshy.ai/output/model.glb" },
  });
  assert.equal(snap.thumbnailUrl, "https://assets.meshy.ai/output/preview-alpha.png");
  assert.equal(snap.glbUrl, "https://assets.meshy.ai/output/model.glb");
});

test("meshyTaskSnapshot ignores non-https thumbnail and glb URLs", () => {
  const snap = meshyTaskSnapshot({
    status: "SUCCEEDED",
    progress: 100,
    thumbnail_url: "javascript:alert(1)",
    model_urls: { glb: "/relative/model.glb" },
  });
  assert.equal(snap.thumbnailUrl, undefined);
  assert.equal(snap.glbUrl, undefined);
  assert.equal(httpsUrl("http://insecure.example/preview.png"), undefined);
});

test("parseHeroProgressEvent accepts same-origin model URLs only", () => {
  const parsed = parseHeroProgressEvent({
    id: "player",
    kind: "humanoid",
    stage: "preview",
    status: "SUCCEEDED",
    progress: 100,
    thumbnailUrl: "https://assets.meshy.ai/preview.png",
    modelUrl: "/api/game-assets/gta/player.glb?v=preview-100",
  });
  assert.ok(parsed);
  assert.equal(parsed?.modelUrl, "/api/game-assets/gta/player.glb?v=preview-100");
  assert.equal(
    parseHeroProgressEvent({
      id: "player",
      kind: "humanoid",
      stage: "preview",
      status: "SUCCEEDED",
      progress: 100,
      modelUrl: "https://evil.example/model.glb",
    })?.modelUrl,
    undefined
  );
});

test("mergeHeroProgress keeps earlier preview URLs when a later event omits them", () => {
  const first: HeroProgressEvent = {
    id: "player",
    kind: "humanoid",
    stage: "preview",
    status: "SUCCEEDED",
    progress: 100,
    thumbnailUrl: "https://assets.meshy.ai/preview.png",
    modelUrl: "/api/game-assets/gta/player.glb?v=preview-100",
  };
  const next: HeroProgressEvent = {
    id: "player",
    kind: "humanoid",
    stage: "refine",
    status: "IN_PROGRESS",
    progress: 12,
  };
  const merged = mergeHeroProgress([first], next);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].stage, "refine");
  assert.equal(merged[0].progress, 12);
  assert.equal(merged[0].thumbnailUrl, first.thumbnailUrl);
  assert.equal(merged[0].modelUrl, first.modelUrl);
});
