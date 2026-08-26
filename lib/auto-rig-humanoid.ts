import { readFile } from "node:fs/promises";
import {
  type Accessor,
  Document,
  Logger,
  type Material,
  type mat4,
  NodeIO,
  type Node as GltfNode,
  type Texture,
  type TextureInfo,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  isDeformJoint,
  QUATERNIUS_CLIPS,
  QUATERNIUS_JOINT_COUNT,
  quaterniusStandardDiskPath,
} from "./quaternius-kernel";

export type AutoRigSuccess = {
  ok: true;
  glb: Buffer;
  clips: string[];
  jointCount: number;
  vertexCount: number;
  scale: number;
};

export type AutoRigFailure = { ok: false; error: string };
export type AutoRigResult = AutoRigSuccess | AutoRigFailure;

type Vec3 = [number, number, number];
type Aabb = { min: Vec3; max: Vec3 };

type BoneSegment = {
  index: number;
  name: string;
  a: Vec3;
  b: Vec3;
};

type WorldPrim = {
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  indices: Uint32Array | null;
  material: Material | null;
};

const MANNEQUIN_HEIGHT = 1.829;
const INFLUENCE_COUNT = 4;
const WEIGHT_POWER = 2.2;

function io(): NodeIO {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function lengthSq(a: Vec3): number {
  return dot(a, a);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function transformPoint(m: mat4, p: Vec3): Vec3 {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

function transformDir(m: mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
  ];
}

function emptyAabb(): Aabb {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function expandAabb(box: Aabb, p: Vec3): void {
  for (let i = 0; i < 3; i++) {
    box.min[i] = Math.min(box.min[i], p[i]);
    box.max[i] = Math.max(box.max[i], p[i]);
  }
}

function aabbSize(box: Aabb): Vec3 {
  return sub(box.max, box.min);
}

function distPointToSegmentSq(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const abLen = lengthSq(ab);
  if (abLen < 1e-10) return lengthSq(sub(p, a));
  const t = clamp(dot(sub(p, a), ab) / abLen, 0, 1);
  const closest = add(a, scaleVec(ab, t));
  return lengthSq(sub(p, closest));
}

function rotateZUpToYUp(p: Vec3): Vec3 {
  // (x, y, z) Z-up -> (x, z, -y) Y-up
  return [p[0], p[2], -p[1]];
}

export function detectUpAxis(box: Aabb): "y" | "z" {
  const size = aabbSize(box);
  if (size[2] > size[1] * 1.2 && box.max[2] > box.max[1]) return "z";
  return "y";
}

export function fitAabbToUniversalHeight(box: Aabb): {
  scale: number;
  offset: Vec3;
  upAxis: "y" | "z";
} {
  const upAxis = detectUpAxis(box);
  const corners: Vec3[] = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        corners.push(upAxis === "z" ? rotateZUpToYUp([x, y, z]) : [x, y, z]);
      }
    }
  }
  const world = emptyAabb();
  for (const c of corners) expandAabb(world, c);

  const height = Math.max(1e-4, world.max[1] - world.min[1]);
  const scale = MANNEQUIN_HEIGHT / height;
  const offset: Vec3 = [
    -((world.min[0] + world.max[0]) / 2) * scale,
    -world.min[1] * scale,
    -((world.min[2] + world.max[2]) / 2) * scale,
  ];
  return { scale, offset, upAxis };
}

function applyFit(p: Vec3, scale: number, offset: Vec3, upAxis: "y" | "z"): Vec3 {
  const q = upAxis === "z" ? rotateZUpToYUp(p) : p;
  return add(scaleVec(q, scale), offset);
}

function collectWorldPrims(doc: Document): { prims: WorldPrim[]; box: Aabb } {
  const box = emptyAabb();
  const prims: WorldPrim[] = [];

  const visit = (node: GltfNode) => {
    const mesh = node.getMesh();
    if (mesh) {
      const world = node.getWorldMatrix();
      for (const primitive of mesh.listPrimitives()) {
        const posAcc = primitive.getAttribute("POSITION");
        if (!posAcc) continue;
        const n = posAcc.getCount();
        const positions = new Float32Array(n * 3);
        const tmp: number[] = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          posAcc.getElement(i, tmp);
          const wp = transformPoint(world, tmp as Vec3);
          positions[i * 3] = wp[0];
          positions[i * 3 + 1] = wp[1];
          positions[i * 3 + 2] = wp[2];
          expandAabb(box, wp);
        }

        const nrmAcc = primitive.getAttribute("NORMAL");
        let normals: Float32Array | null = null;
        if (nrmAcc && nrmAcc.getCount() === n) {
          normals = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            nrmAcc.getElement(i, tmp);
            const wn = transformDir(world, tmp as Vec3);
            normals[i * 3] = wn[0];
            normals[i * 3 + 1] = wn[1];
            normals[i * 3 + 2] = wn[2];
          }
        }

        const uvAcc = primitive.getAttribute("TEXCOORD_0");
        let uvs: Float32Array | null = null;
        if (uvAcc && uvAcc.getCount() === n) {
          uvs = new Float32Array(n * 2);
          const uv = [0, 0];
          for (let i = 0; i < n; i++) {
            uvAcc.getElement(i, uv);
            uvs[i * 2] = uv[0];
            uvs[i * 2 + 1] = uv[1];
          }
        }

        const idxAcc = primitive.getIndices();
        let indices: Uint32Array | null = null;
        if (idxAcc) {
          indices = new Uint32Array(idxAcc.getCount());
          const one = [0];
          for (let i = 0; i < idxAcc.getCount(); i++) {
            idxAcc.getElement(i, one);
            indices[i] = one[0];
          }
        }

        prims.push({
          positions,
          normals,
          uvs,
          indices,
          material: primitive.getMaterial(),
        });
      }
    }
    for (const child of node.listChildren()) visit(child);
  };

  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (scene) {
    for (const child of scene.listChildren()) visit(child);
  } else {
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getParentNode()) visit(node);
    }
  }

  return { prims, box };
}

function buildBoneSegments(joints: GltfNode[]): BoneSegment[] {
  const indexByJoint = new Map<GltfNode, number>();
  joints.forEach((j, i) => indexByJoint.set(j, i));
  const segments: BoneSegment[] = [];

  joints.forEach((joint, index) => {
    if (!isDeformJoint(joint.getName())) return;
    const a = joint.getWorldTranslation() as Vec3;
    const childJoints = joint
      .listChildren()
      .filter((c) => indexByJoint.has(c) && isDeformJoint(c.getName()));
    if (childJoints.length === 0) {
      const parent = joint.getParentNode();
      const parentPos = parent ? (parent.getWorldTranslation() as Vec3) : a;
      const dir = sub(a, parentPos);
      const fallback = lengthSq(dir) < 1e-8 ? ([0, 0.08, 0] as Vec3) : scaleVec(dir, 0.35);
      segments.push({ index, name: joint.getName(), a, b: add(a, fallback) });
      return;
    }
    for (const child of childJoints) {
      segments.push({
        index,
        name: joint.getName(),
        a,
        b: child.getWorldTranslation() as Vec3,
      });
    }
  });
  return segments;
}

function regionAllowsBone(p: Vec3, boneName: string): boolean {
  const x = p[0];
  const y = p[1];
  const absX = Math.abs(x);

  if (boneName === "pelvis" && y < 0.82) return false;

  const isHeadBone = boneName === "Head" || boneName === "neck_01";
  if (isHeadBone && y < 1.35) return false;
  if (y > 1.55 && absX < 0.22 && !isHeadBone && !boneName.startsWith("spine")) {
    return false;
  }

  const isLeftArm =
    boneName.endsWith("_l") &&
    (boneName.includes("arm") ||
      boneName.includes("hand") ||
      boneName.includes("clavicle") ||
      boneName.includes("index") ||
      boneName.includes("middle") ||
      boneName.includes("ring") ||
      boneName.includes("pinky") ||
      boneName.includes("thumb"));
  const isRightArm =
    boneName.endsWith("_r") &&
    (boneName.includes("arm") ||
      boneName.includes("hand") ||
      boneName.includes("clavicle") ||
      boneName.includes("index") ||
      boneName.includes("middle") ||
      boneName.includes("ring") ||
      boneName.includes("pinky") ||
      boneName.includes("thumb"));

  if (absX > 0.28 && y > 1.2 && y < 1.58) {
    if (x > 0 && !isLeftArm) return false;
    if (x < 0 && !isRightArm) return false;
  }

  const isLeftLeg =
    boneName.endsWith("_l") &&
    (boneName.includes("thigh") ||
      boneName.includes("calf") ||
      boneName.includes("foot") ||
      boneName.includes("ball"));
  const isRightLeg =
    boneName.endsWith("_r") &&
    (boneName.includes("thigh") ||
      boneName.includes("calf") ||
      boneName.includes("foot") ||
      boneName.includes("ball"));
  if (y < 0.85) {
    if (x > 0.02 && !isLeftLeg) return false;
    if (x < -0.02 && !isRightLeg) return false;
    if (Math.abs(x) <= 0.02 && !isLeftLeg && !isRightLeg) return false;
  }

  return true;
}

function skinVertex(
  p: Vec3,
  segments: BoneSegment[],
  jointCount: number
): { indices: number[]; weights: number[] } {
  const best: { index: number; distSq: number }[] = [];
  const seen = new Set<number>();

  for (const seg of segments) {
    if (!regionAllowsBone(p, seg.name)) continue;
    const d = distPointToSegmentSq(p, seg.a, seg.b);
    if (seen.has(seg.index) && best.find((b) => b.index === seg.index && b.distSq <= d)) {
      continue;
    }
    let replaced = false;
    for (let i = 0; i < best.length; i++) {
      if (best[i].index === seg.index && d < best[i].distSq) {
        best[i] = { index: seg.index, distSq: d };
        replaced = true;
        break;
      }
    }
    if (replaced) continue;
    if (seen.has(seg.index)) continue;
    best.push({ index: seg.index, distSq: d });
    seen.add(seg.index);
  }

  best.sort((a, b) => a.distSq - b.distSq);
  const top = best.slice(0, INFLUENCE_COUNT);
  if (!top.length) {
    return { indices: [1, 0, 0, 0], weights: [1, 0, 0, 0] };
  }

  const raw = top.map((b) => 1 / Math.pow(b.distSq + 1e-6, WEIGHT_POWER / 2));
  const sum = raw.reduce((s, v) => s + v, 0) || 1;
  const indices = [0, 0, 0, 0];
  const weights = [0, 0, 0, 0];
  top.forEach((b, i) => {
    indices[i] = clamp(b.index, 0, jointCount - 1);
    weights[i] = raw[i] / sum;
  });
  return { indices, weights };
}

function copyAccessorArray(
  dest: Document,
  buffer: ReturnType<Document["createBuffer"]>,
  name: string,
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4",
  array: Float32Array | Uint16Array | Uint32Array
): Accessor {
  const copy =
    array instanceof Uint16Array
      ? new Uint16Array(array)
      : array instanceof Uint32Array
        ? new Uint32Array(array)
        : new Float32Array(array);
  return dest.createAccessor(name, buffer).setType(type).setArray(copy);
}

function copyTexture(dest: Document, src: Texture | null): Texture | null {
  if (!src) return null;
  const tex = dest.createTexture(src.getName());
  const image = src.getImage();
  if (image) tex.setImage(image);
  const mime = src.getMimeType();
  if (mime) tex.setMimeType(mime);
  const uri = src.getURI();
  if (uri) tex.setURI(uri);
  return tex;
}

function copyTexInfo(
  srcInfo: TextureInfo | null,
  destInfo: TextureInfo | null
): void {
  if (!srcInfo || !destInfo) return;
  destInfo.setTexCoord(srcInfo.getTexCoord());
  destInfo.setMagFilter(srcInfo.getMagFilter());
  destInfo.setMinFilter(srcInfo.getMinFilter());
  destInfo.setWrapS(srcInfo.getWrapS());
  destInfo.setWrapT(srcInfo.getWrapT());
}

function copyMaterial(
  dest: Document,
  src: Material,
  cache: Map<Material, Material>
): Material {
  const existing = cache.get(src);
  if (existing) return existing;

  const m = dest
    .createMaterial(src.getName())
    .setBaseColorFactor(src.getBaseColorFactor())
    .setMetallicFactor(src.getMetallicFactor())
    .setRoughnessFactor(src.getRoughnessFactor())
    .setEmissiveFactor(src.getEmissiveFactor())
    .setAlphaMode(src.getAlphaMode())
    .setAlphaCutoff(src.getAlphaCutoff())
    .setDoubleSided(src.getDoubleSided())
    .setNormalScale(src.getNormalScale())
    .setOcclusionStrength(src.getOcclusionStrength());

  const slots: Array<{
    get: () => Texture | null;
    set: (tex: Texture) => void;
  }> = [
    {
      get: () => src.getBaseColorTexture(),
      set: (tex) => {
        m.setBaseColorTexture(tex);
        copyTexInfo(src.getBaseColorTextureInfo(), m.getBaseColorTextureInfo());
      },
    },
    {
      get: () => src.getMetallicRoughnessTexture(),
      set: (tex) => {
        m.setMetallicRoughnessTexture(tex);
        copyTexInfo(
          src.getMetallicRoughnessTextureInfo(),
          m.getMetallicRoughnessTextureInfo()
        );
      },
    },
    {
      get: () => src.getNormalTexture(),
      set: (tex) => {
        m.setNormalTexture(tex);
        copyTexInfo(src.getNormalTextureInfo(), m.getNormalTextureInfo());
      },
    },
    {
      get: () => src.getOcclusionTexture(),
      set: (tex) => {
        m.setOcclusionTexture(tex);
        copyTexInfo(src.getOcclusionTextureInfo(), m.getOcclusionTextureInfo());
      },
    },
    {
      get: () => src.getEmissiveTexture(),
      set: (tex) => {
        m.setEmissiveTexture(tex);
        copyTexInfo(src.getEmissiveTextureInfo(), m.getEmissiveTextureInfo());
      },
    },
  ];

  const textureCache = new Map<Texture, Texture>();
  for (const slot of slots) {
    const srcTex = slot.get();
    if (!srcTex) continue;
    let destTex = textureCache.get(srcTex);
    if (!destTex) {
      const copied = copyTexture(dest, srcTex);
      if (!copied) continue;
      textureCache.set(srcTex, copied);
      destTex = copied;
    }
    slot.set(destTex);
  }

  cache.set(src, m);
  return m;
}

/**
 * Bind an unrigged (or differently-rigged) mesh onto the Quaternius Universal
 * skeleton and pack the Standard kernel clips into the same GLB.
 */
export async function autoRigToQuaterniusKernel(
  meshBytes: Buffer | Uint8Array,
  opts?: { kernelPath?: string }
): Promise<AutoRigResult> {
  const kernelPath = opts?.kernelPath ?? quaterniusStandardDiskPath();
  let kernelBytes: Buffer;
  try {
    kernelBytes = await readFile(kernelPath);
  } catch {
    return { ok: false, error: `Quaternius kernel missing at ${kernelPath}` };
  }

  try {
    const reader = io();
    const dest = await reader.readBinary(new Uint8Array(kernelBytes));
    const meshDoc = await reader.readBinary(new Uint8Array(meshBytes));

    const skin = dest.getRoot().listSkins()[0];
    if (!skin) return { ok: false, error: "Quaternius kernel has no skin" };
    const joints = skin.listJoints();
    if (joints.length !== QUATERNIUS_JOINT_COUNT) {
      return {
        ok: false,
        error: `Kernel joint count ${joints.length} != ${QUATERNIUS_JOINT_COUNT}`,
      };
    }

    const { prims, box } = collectWorldPrims(meshDoc);
    if (!prims.length || !Number.isFinite(box.min[0])) {
      return { ok: false, error: "Source mesh has no vertices" };
    }

    const { scale, offset, upAxis } = fitAabbToUniversalHeight(box);
    if (!Number.isFinite(scale) || scale <= 0) {
      return { ok: false, error: "Could not compute a valid fit scale" };
    }

    for (const prim of prims) {
      const n = prim.positions.length / 3;
      for (let i = 0; i < n; i++) {
        const fitted = applyFit(
          [
            prim.positions[i * 3],
            prim.positions[i * 3 + 1],
            prim.positions[i * 3 + 2],
          ],
          scale,
          offset,
          upAxis
        );
        prim.positions[i * 3] = fitted[0];
        prim.positions[i * 3 + 1] = fitted[1];
        prim.positions[i * 3 + 2] = fitted[2];
        if (prim.normals && upAxis === "z") {
          const nrm = rotateZUpToYUp([
            prim.normals[i * 3],
            prim.normals[i * 3 + 1],
            prim.normals[i * 3 + 2],
          ]);
          prim.normals[i * 3] = nrm[0];
          prim.normals[i * 3 + 1] = nrm[1];
          prim.normals[i * 3 + 2] = nrm[2];
        }
      }
    }

    dest.setLogger(new Logger(Logger.Verbosity.ERROR));
    dest.getRoot().getAsset().generator = "gitreverse-quaternius-kernel";
    const destJoints = skin.listJoints();
    const segments = buildBoneSegments(destJoints);
    const destBuffer =
      dest.getRoot().listBuffers()[0] ?? dest.createBuffer("kernel");

    const materialMap = new Map<Material, Material>();

    const heroMesh = dest.createMesh("Hero");
    let vertexCount = 0;

    prims.forEach((prim, primIndex) => {
      const n = prim.positions.length / 3;
      vertexCount += n;
      const jointsArr = new Uint16Array(n * 4);
      const weightsArr = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const p: Vec3 = [
          prim.positions[i * 3],
          prim.positions[i * 3 + 1],
          prim.positions[i * 3 + 2],
        ];
        const skinned = skinVertex(p, segments, destJoints.length);
        for (let k = 0; k < 4; k++) {
          jointsArr[i * 4 + k] = skinned.indices[k];
          weightsArr[i * 4 + k] = skinned.weights[k];
        }
      }

      const destPrim = dest.createPrimitive().setMode(4);
      destPrim.setAttribute(
        "POSITION",
        copyAccessorArray(
          dest,
          destBuffer,
          `hero_${primIndex}_pos`,
          "VEC3",
          prim.positions
        )
      );
      if (prim.normals) {
        destPrim.setAttribute(
          "NORMAL",
          copyAccessorArray(
            dest,
            destBuffer,
            `hero_${primIndex}_nrm`,
            "VEC3",
            prim.normals
          )
        );
      }
      if (prim.uvs) {
        destPrim.setAttribute(
          "TEXCOORD_0",
          copyAccessorArray(
            dest,
            destBuffer,
            `hero_${primIndex}_uv`,
            "VEC2",
            prim.uvs
          )
        );
      }
      destPrim.setAttribute(
        "JOINTS_0",
        copyAccessorArray(
          dest,
          destBuffer,
          `hero_${primIndex}_joints`,
          "VEC4",
          jointsArr
        )
      );
      destPrim.setAttribute(
        "WEIGHTS_0",
        copyAccessorArray(
          dest,
          destBuffer,
          `hero_${primIndex}_weights`,
          "VEC4",
          weightsArr
        )
      );
      if (prim.indices) {
        destPrim.setIndices(
          copyAccessorArray(
            dest,
            destBuffer,
            `hero_${primIndex}_idx`,
            "SCALAR",
            prim.indices
          )
        );
      }
      if (prim.material) {
        destPrim.setMaterial(copyMaterial(dest, prim.material, materialMap));
      }
      heroMesh.addPrimitive(destPrim);
    });

    let bound = false;
    for (const node of dest.getRoot().listNodes()) {
      const mesh = node.getMesh();
        if (mesh && (mesh.getName() === "Mannequin" || node.getSkin() === skin)) {
        const old = mesh;
        node.setMesh(heroMesh);
        node.setSkin(skin);
        if (old && old !== heroMesh) old.dispose();
        bound = true;
      }
    }
    if (!bound) {
      const armature =
        dest.getRoot().listNodes().find((n) => n.getName() === "Armature") ??
        dest.getRoot().listNodes()[0];
      const heroNode = dest.createNode("Hero").setMesh(heroMesh).setSkin(skin);
      if (armature) armature.addChild(heroNode);
      else dest.getRoot().listScenes()[0]?.addChild(heroNode);
    }

    const clips = dest
      .getRoot()
      .listAnimations()
      .map((a) => a.getName())
      .filter(Boolean);
    if (clips.length < 10) {
      return { ok: false, error: `Kernel clips missing after rig (${clips.length})` };
    }

    const glb = await io().writeBinary(dest);
    return {
      ok: true,
      glb: Buffer.from(glb),
      clips: clips.length ? clips : [...QUATERNIUS_CLIPS],
      jointCount: destJoints.length,
      vertexCount,
      scale,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
