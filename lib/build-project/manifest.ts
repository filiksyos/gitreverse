import { z } from "zod";

export const MAX_PROMPT_LENGTH = 24000;
export const MAX_PROJECT_BYTES = 300000;
export const projectSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,49}$/),
    description: z.string().min(1).max(300),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(180),
            content: z.string().max(100000),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();
export type BuiltProject = z.infer<typeof projectSchema>;

export function validateProject(input: unknown): BuiltProject {
  const project = projectSchema.parse(input);
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of project.files) {
    const parts = file.path.split("/");
    if (
      parts.some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[\\\x00-\x1f\x7f:*?<>|]/.test(p) ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      ) ||
      file.path.startsWith("/") ||
      file.path.includes("%") ||
      !/^[\x20-\x7e]+$/.test(file.path)
    )
      throw new Error("Unsafe project path.");
    if (
      parts.some((p) =>
        /^(\.git|\.github|node_modules|\.next|\.vercel|\.aws|\.ssh)$/i.test(p),
      ) ||
      parts.some((p) => /^\.env(?:\.|$)/i.test(p) && p !== ".env.example") ||
      /\.(pem|key|p12|pfx)$/i.test(file.path)
    )
      throw new Error(
        "Credentials and automatic workflow files are not allowed.",
      );
    const key = file.path.toLowerCase();
    if (paths.has(key)) throw new Error("Duplicate project path.");
    paths.add(key);
    bytes += new TextEncoder().encode(file.content).byteLength;
    if (file.content.includes("\0"))
      throw new Error("Binary content is not supported.");
    if (
      /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(
        file.content,
      )
    )
      throw new Error(
        "Possible credential in generated files. Remove it before export.",
      );
  }
  for (const path of paths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++)
      if (paths.has(parts.slice(0, i).join("/")))
        throw new Error("A file conflicts with a directory.");
  }
  if (bytes > MAX_PROJECT_BYTES)
    throw new Error("Generated project is too large.");
  if (!paths.has("readme.md"))
    throw new Error("Generated project must include README.md.");
  return project;
}

/** Store-only ZIP: no dependencies, executable bits, symlinks, or commands. */
export function projectZip(input: BuiltProject): Uint8Array {
  const project = validateProject(input);
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const file of project.files) {
    const name = encoder.encode(`${project.name}/${file.path}`),
      content = encoder.encode(file.content);
    let crc = 0xffffffff;
    for (const b of content) {
      crc ^= b;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, content.length, true);
    v.setUint32(22, content.length, true);
    v.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, content);
    const dir = new Uint8Array(46 + name.length),
      d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, content.length, true);
    d.setUint32(24, content.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);
    offset += header.length + content.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, project.files.length, true);
  e.setUint16(10, project.files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const zip = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const chunk of [...local, ...central, end]) {
    zip.set(chunk, cursor);
    cursor += chunk.length;
  }
  return zip;
}
