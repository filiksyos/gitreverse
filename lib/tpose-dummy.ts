import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

type Vec3 = [number, number, number];

function addBox(
  positions: number[],
  indices: number[],
  min: Vec3,
  max: Vec3
): void {
  const base = positions.length / 3;
  const corners: Vec3[] = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]],
  ];
  for (const c of corners) positions.push(c[0], c[1], c[2]);
  const faces = [
    [0, 1, 2, 0, 2, 3],
    [4, 6, 5, 4, 7, 6],
    [0, 4, 5, 0, 5, 1],
    [3, 2, 6, 3, 6, 7],
    [0, 3, 7, 0, 7, 4],
    [1, 5, 6, 1, 6, 2],
  ];
  for (const face of faces) {
    for (const i of face) indices.push(base + i);
  }
}

/** Unskinned T-pose stand-in (~1.83m, Y-up, facing +Z) for auto-rig tests. */
export function buildTPoseDummyDocument(): Document {
  const positions: number[] = [];
  const indices: number[] = [];

  addBox(positions, indices, [-0.14, 0.86, -0.08], [0.14, 1.08, 0.09]); // hips
  addBox(positions, indices, [-0.17, 1.08, -0.09], [0.17, 1.48, 0.11]); // torso
  addBox(positions, indices, [-0.11, 1.52, -0.11], [0.11, 1.82, 0.13]); // head
  addBox(positions, indices, [0.17, 1.38, -0.05], [0.46, 1.50, 0.05]); // L upper arm
  addBox(positions, indices, [0.46, 1.38, -0.05], [0.74, 1.50, 0.05]); // L lower arm
  addBox(positions, indices, [0.74, 1.36, -0.06], [0.90, 1.50, 0.04]); // L hand
  addBox(positions, indices, [-0.46, 1.38, -0.05], [-0.17, 1.50, 0.05]); // R upper arm
  addBox(positions, indices, [-0.74, 1.38, -0.05], [-0.46, 1.50, 0.05]); // R lower arm
  addBox(positions, indices, [-0.90, 1.36, -0.06], [-0.74, 1.50, 0.04]); // R hand
  addBox(positions, indices, [0.03, 0.50, -0.07], [0.16, 0.90, 0.07]); // L thigh
  addBox(positions, indices, [0.04, 0.08, -0.06], [0.15, 0.50, 0.06]); // L calf
  addBox(positions, indices, [0.03, 0.00, -0.08], [0.16, 0.08, 0.16]); // L foot
  addBox(positions, indices, [-0.16, 0.50, -0.07], [-0.03, 0.90, 0.07]); // R thigh
  addBox(positions, indices, [-0.15, 0.08, -0.06], [-0.04, 0.50, 0.06]); // R calf
  addBox(positions, indices, [-0.16, 0.00, -0.08], [-0.03, 0.08, 0.16]); // R foot

  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc
    .createAccessor("pos", buffer)
    .setType("VEC3")
    .setArray(new Float32Array(positions));
  const idx = doc
    .createAccessor("idx", buffer)
    .setType("SCALAR")
    .setArray(new Uint32Array(indices));
  const material = doc
    .createMaterial("dummy")
    .setBaseColorFactor([0.82, 0.45, 0.22, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.7);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", pos)
    .setIndices(idx)
    .setMaterial(material)
    .setMode(4);
  const mesh = doc.createMesh("TPoseDummy").addPrimitive(prim);
  const node = doc.createNode("TPoseDummy").setMesh(mesh);
  const scene = doc.createScene("Scene").addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

export async function buildTPoseDummyGlb(): Promise<Buffer> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const bytes = await io.writeBinary(buildTPoseDummyDocument());
  return Buffer.from(bytes);
}
