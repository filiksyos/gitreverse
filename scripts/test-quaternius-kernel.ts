import assert from "node:assert/strict";
import test from "node:test";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { autoRigToQuaterniusKernel, fitAabbToUniversalHeight } from "../lib/auto-rig-humanoid";
import { buildTPoseDummyGlb } from "../lib/tpose-dummy";
import {
  GAME_ACTION_TO_CLIP,
  QUATERNIUS_CLIP_COUNT,
  QUATERNIUS_CLIPS,
  QUATERNIUS_JOINT_COUNT,
  QUATERNIUS_JOINTS,
  isDeformJoint,
  quaterniusRootMotionDiskPath,
  quaterniusStandardDiskPath,
  resolveGameClip,
} from "../lib/quaternius-kernel";

test("kernel clip and joint tables match the vendored GLB contract", () => {
  assert.equal(QUATERNIUS_CLIPS.length, QUATERNIUS_CLIP_COUNT);
  assert.equal(QUATERNIUS_JOINTS.length, QUATERNIUS_JOINT_COUNT);
  assert.equal(resolveGameClip("walk"), "Walk_Loop");
  assert.deepEqual(resolveGameClip("jump"), [
    "Jump_Start",
    "Jump_Loop",
    "Jump_Land",
  ]);
  assert.equal(GAME_ACTION_TO_CLIP.idle, "Idle_Loop");
  assert.equal(GAME_ACTION_TO_CLIP.drive, "Driving_Loop");
  assert.equal(GAME_ACTION_TO_CLIP.pass, "Interact");
  assert.equal(GAME_ACTION_TO_CLIP.shot, "Interact");
  assert.equal(GAME_ACTION_TO_CLIP.keeperDive, "Roll");
  assert.equal(GAME_ACTION_TO_CLIP.crouch, "Crouch_Idle_Loop");
  assert.deepEqual(resolveGameClip("header"), ["Jump_Start", "Jump_Loop", "Jump_Land"]);
  assert.equal(GAME_ACTION_TO_CLIP.celebration, "Dance_Loop");
  assert.equal(GAME_ACTION_TO_CLIP.enterSeat, "Sitting_Enter");
  assert.equal(GAME_ACTION_TO_CLIP.exitSeat, "Sitting_Exit");
  assert.notEqual(GAME_ACTION_TO_CLIP.shot, "Punch_Jab");
  assert.notEqual(GAME_ACTION_TO_CLIP.shot, "Sword_Attack");
  assert.equal(isDeformJoint("root"), false);
  assert.equal(isDeformJoint("index_04_leaf_l"), false);
  assert.equal(isDeformJoint("upperarm_l"), true);
});

test("vendored UAL1_Standard.glb is the Universal kernel", async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(quaterniusStandardDiskPath());
  const skin = doc.getRoot().listSkins()[0];
  assert.ok(skin, "missing Armature skin");
  assert.equal(skin.getName(), "Armature");
  const joints = skin.listJoints().map((j) => j.getName());
  assert.equal(joints.length, QUATERNIUS_JOINT_COUNT);
  assert.deepEqual(joints, [...QUATERNIUS_JOINTS]);
  const clips = doc.getRoot().listAnimations().map((a) => a.getName());
  assert.equal(clips.length, QUATERNIUS_CLIP_COUNT);
  for (const name of QUATERNIUS_CLIPS) {
    assert.ok(clips.includes(name), `missing clip ${name}`);
  }
});

test("vendored UAL1_Standard_RM.glb is the same Universal skeleton with root motion", async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(quaterniusRootMotionDiskPath());
  const skin = doc.getRoot().listSkins()[0];
  assert.ok(skin, "missing Armature skin");
  assert.equal(skin.getName(), "Armature");
  assert.equal(skin.listJoints().length, QUATERNIUS_JOINT_COUNT);
  const clips = doc.getRoot().listAnimations().map((a) => a.getName());
  assert.equal(clips.length, QUATERNIUS_CLIP_COUNT);
  for (const name of QUATERNIUS_CLIPS) {
    assert.ok(clips.includes(name), `RM missing clip ${name}`);
  }
});

test("fitAabbToUniversalHeight scales and grounds a tall Z-up mesh", () => {
  const fit = fitAabbToUniversalHeight({
    min: [-50, -20, 0],
    max: [50, 20, 180],
  });
  assert.equal(fit.upAxis, "z");
  assert.ok(fit.scale > 0);
  assert.ok(Math.abs(180 * fit.scale - 1.829) < 0.02);
});

test("auto-rig binds a T-pose dummy onto the kernel and keeps clips", async () => {
  const dummy = await buildTPoseDummyGlb();
  const result = await autoRigToQuaterniusKernel(dummy);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) return;

  assert.equal(result.jointCount, QUATERNIUS_JOINT_COUNT);
  assert.ok(result.vertexCount > 50);
  assert.ok(result.clips.includes("Idle_Loop"));
  assert.ok(result.clips.includes("Walk_Loop"));
  assert.ok(result.clips.includes("Sprint_Loop"));
  assert.equal(result.clips.length, QUATERNIUS_CLIP_COUNT);

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(result.glb));
  const skin = doc.getRoot().listSkins()[0];
  assert.equal(skin.listJoints().length, QUATERNIUS_JOINT_COUNT);
  const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === "Hero");
  assert.ok(mesh, "hero mesh missing");
  const prim = mesh.listPrimitives()[0];
  assert.ok(prim.getAttribute("JOINTS_0"), "missing JOINTS_0");
  assert.ok(prim.getAttribute("WEIGHTS_0"), "missing WEIGHTS_0");

  const weights = prim.getAttribute("WEIGHTS_0");
  const joints = prim.getAttribute("JOINTS_0");
  assert.ok(weights && joints);
  let badWeights = 0;
  let badJoints = 0;
  const w = [0, 0, 0, 0];
  const ji = [0, 0, 0, 0];
  for (let i = 0; i < weights.getCount(); i++) {
    weights.getElement(i, w);
    joints.getElement(i, ji);
    const sum = w[0] + w[1] + w[2] + w[3];
    if (Math.abs(sum - 1) > 0.05) badWeights += 1;
    if (ji.some((idx) => idx < 0 || idx >= QUATERNIUS_JOINT_COUNT)) badJoints += 1;
  }
  assert.equal(badWeights, 0, `vertices with weights not summing to 1: ${badWeights}`);
  assert.equal(badJoints, 0, `vertices with out-of-range joints: ${badJoints}`);
});
