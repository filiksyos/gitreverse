import {
  meshyTaskSnapshot,
  type MeshyTaskSnapshot,
} from "@/lib/meshy-progress";

const MESHY_BASE = "https://api.meshy.ai/openapi";
const POLL_MS = 3_000;

export function getMeshyApiKey(): string | null {
  const key = process.env.MESHY_API_KEY?.trim();
  return key || null;
}

type MeshyCreateResponse = { result?: string };
type MeshyTask = {
  id?: string;
  status?: string;
  progress?: number;
  thumbnail_url?: string;
  alpha_thumbnail_url?: string;
  task_error?: { message?: string } | string | null;
  model_urls?: { glb?: string };
  result?: {
    rigged_character_glb_url?: string;
    basic_animations?: {
      walking_glb_url?: string;
    };
  };
};

export type MeshySculptStage = "preview" | "refine";

export type MeshySculptProgress = MeshyTaskSnapshot & {
  stage: MeshySculptStage;
  glb?: Buffer;
};

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function taskErrorMessage(task: MeshyTask): string {
  const err = task.task_error;
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message ?? "";
}

async function meshyJson<T>(
  url: string,
  init: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : `Meshy HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }
  return { ok: true, data: data as T };
}

function remainingMs(deadlineAt?: number, fallback = 180_000): number {
  if (!deadlineAt) return fallback;
  return Math.max(0, deadlineAt - Date.now());
}

function isTerminal(status: string): boolean {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED";
}

async function pollTask(opts: {
  url: string;
  apiKey: string;
  timeoutMs: number;
  onProgress?: (snapshot: MeshyTaskSnapshot) => void | Promise<void>;
}): Promise<{ ok: true; task: MeshyTask } | { ok: false; error: string }> {
  if (opts.timeoutMs <= 0) {
    return { ok: false, error: "Meshy task timed out" };
  }
  const started = Date.now();
  while (Date.now() - started < opts.timeoutMs) {
    const got = await meshyJson<MeshyTask>(opts.url, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    if (!got.ok) return got;
    const snapshot = meshyTaskSnapshot(got.data);
    await opts.onProgress?.(snapshot);
    if (snapshot.status === "SUCCEEDED") return { ok: true, task: got.data };
    if (snapshot.status === "FAILED" || snapshot.status === "CANCELED") {
      return {
        ok: false,
        error: taskErrorMessage(got.data) || `Meshy task ${snapshot.status.toLowerCase()}`,
      };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { ok: false, error: "Meshy task timed out" };
}

function parseSseDataLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const json = trimmed.slice(5).trim();
  if (!json || json === "[DONE]") return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function applyStreamPayload(
  payload: unknown,
  last: MeshyTask | null,
  onProgress?: (snapshot: MeshyTaskSnapshot) => void | Promise<void>
): Promise<
  | { last: MeshyTask; terminal: false }
  | { last: MeshyTask; terminal: true; ok: true }
  | { last: MeshyTask; terminal: true; ok: false; error: string }
> {
  if (!payload || typeof payload !== "object") {
    return { last: last ?? {}, terminal: false };
  }
  const task = payload as MeshyTask & { status_code?: number; message?: string };
  if (typeof task.status_code === "number" && !task.status) {
    return {
      last: last ?? {},
      terminal: true,
      ok: false,
      error: task.message || "Meshy stream error",
    };
  }
  const merged = { ...last, ...task };
  await onProgress?.(meshyTaskSnapshot(merged));
  const status = meshyTaskSnapshot(merged).status;
  if (!isTerminal(status)) return { last: merged, terminal: false };
  if (status === "SUCCEEDED") return { last: merged, terminal: true, ok: true };
  return {
    last: merged,
    terminal: true,
    ok: false,
    error: taskErrorMessage(merged) || `Meshy task ${status.toLowerCase()}`,
  };
}

async function streamTextTo3dTask(opts: {
  taskId: string;
  apiKey: string;
  timeoutMs: number;
  onProgress?: (snapshot: MeshyTaskSnapshot) => void | Promise<void>;
}): Promise<{ ok: true; task: MeshyTask } | { ok: false; error: string } | null> {
  if (opts.timeoutMs <= 0) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${MESHY_BASE}/v2/text-to-3d/${opts.taskId}/stream`, {
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let last: MeshyTask | null = null;

    const finishSucceeded = async (task: MeshyTask) => {
      const full = await meshyJson<MeshyTask>(
        `${MESHY_BASE}/v2/text-to-3d/${opts.taskId}`,
        { headers: { Authorization: `Bearer ${opts.apiKey}` } }
      );
      if (full.ok) {
        await opts.onProgress?.(meshyTaskSnapshot(full.data));
        return { ok: true as const, task: full.data };
      }
      return { ok: true as const, task };
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const payload = parseSseDataLine(line);
        if (payload == null) continue;
        const applied = await applyStreamPayload(payload, last, opts.onProgress);
        last = applied.last;
        if (!applied.terminal) continue;
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        if (applied.ok) return finishSucceeded(applied.last);
        return { ok: false, error: applied.error };
      }
    }

    const tail = parseSseDataLine(buf);
    if (tail != null) {
      const applied = await applyStreamPayload(tail, last, opts.onProgress);
      last = applied.last;
      if (applied.terminal) {
        if (applied.ok) return finishSucceeded(applied.last);
        return { ok: false, error: applied.error };
      }
    }

    if (last && meshyTaskSnapshot(last).status === "SUCCEEDED") {
      return finishSucceeded(last);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function watchTextTo3dTask(opts: {
  taskId: string;
  apiKey: string;
  timeoutMs: number;
  onProgress?: (snapshot: MeshyTaskSnapshot) => void | Promise<void>;
}): Promise<{ ok: true; task: MeshyTask } | { ok: false; error: string }> {
  const started = Date.now();
  const streamed = await streamTextTo3dTask(opts);
  if (streamed) return streamed;
  return pollTask({
    url: `${MESHY_BASE}/v2/text-to-3d/${opts.taskId}`,
    apiKey: opts.apiKey,
    timeoutMs: Math.max(0, opts.timeoutMs - (Date.now() - started)),
    onProgress: opts.onProgress,
  });
}

export async function downloadBinary(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Meshy asset (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function emitSculptProgress(
  onProgress: ((progress: MeshySculptProgress) => void | Promise<void>) | undefined,
  stage: MeshySculptStage,
  snapshot: MeshyTaskSnapshot,
  glb?: Buffer
): Promise<void> {
  await onProgress?.({ ...snapshot, stage, glb });
}

export async function generateTexturedGlb(opts: {
  apiKey: string;
  prompt: string;
  poseMode?: "a-pose" | "t-pose" | "";
  timeoutMs?: number;
  deadlineAt?: number;
  onStatus?: (message: string) => void;
  onProgress?: (progress: MeshySculptProgress) => void | Promise<void>;
}): Promise<
  | { ok: true; glb: Buffer; refineTaskId: string | null }
  | { ok: false; error: string }
> {
  const report = async (
    stage: MeshySculptStage,
    snapshot: MeshyTaskSnapshot,
    glb?: Buffer
  ) => {
    const label =
      stage === "preview" ? "Sculpting hero mesh" : "Painting hero textures";
    opts.onStatus?.(`${label} (${snapshot.progress}% ${snapshot.status})`);
    await emitSculptProgress(opts.onProgress, stage, snapshot, glb);
  };

  opts.onStatus?.("Sculpting hero mesh");
  await report("preview", { status: "PENDING", progress: 0 });

  const preview = await meshyJson<MeshyCreateResponse>(
    `${MESHY_BASE}/v2/text-to-3d`,
    {
      method: "POST",
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        mode: "preview",
        prompt: opts.prompt,
        pose_mode: opts.poseMode ?? "",
        should_remesh: true,
        target_polycount: 30000,
        target_formats: ["glb"],
        alpha_thumbnail: true,
        ai_model: "latest",
      }),
    }
  );
  if (!preview.ok || !preview.data.result) {
    return { ok: false, error: preview.ok ? "Meshy preview missing id" : preview.error };
  }

  const previewDone = await watchTextTo3dTask({
    taskId: preview.data.result,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 180_000),
    onProgress: (snapshot) => report("preview", snapshot),
  });
  if (!previewDone.ok) return previewDone;

  const previewSnap = meshyTaskSnapshot(previewDone.task);
  let previewGlb: Buffer | undefined;
  if (previewSnap.glbUrl) {
    previewGlb = await downloadBinary(previewSnap.glbUrl);
    await report("preview", previewSnap, previewGlb);
  } else {
    await report("preview", previewSnap);
  }

  opts.onStatus?.("Painting hero textures");
  await report("refine", { status: "PENDING", progress: 0 });

  const refine = await meshyJson<MeshyCreateResponse>(
    `${MESHY_BASE}/v2/text-to-3d`,
    {
      method: "POST",
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        mode: "refine",
        preview_task_id: preview.data.result,
        enable_pbr: true,
        texture_resolution: "2k",
        target_formats: ["glb"],
        alpha_thumbnail: true,
        ai_model: "latest",
      }),
    }
  );
  if (!refine.ok || !refine.data.result) {
    if (previewGlb) {
      return { ok: true, glb: previewGlb, refineTaskId: null };
    }
    return { ok: false, error: refine.ok ? "Meshy refine missing id" : refine.error };
  }

  const refineDone = await watchTextTo3dTask({
    taskId: refine.data.result,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 180_000),
    onProgress: (snapshot) => report("refine", snapshot),
  });
  if (!refineDone.ok) {
    if (previewGlb) {
      return { ok: true, glb: previewGlb, refineTaskId: null };
    }
    return refineDone;
  }

  const refineSnap = meshyTaskSnapshot(refineDone.task);
  const glbUrl = refineSnap.glbUrl ?? previewSnap.glbUrl;
  if (!glbUrl) return { ok: false, error: "Meshy refine produced no GLB" };
  const glb = await downloadBinary(glbUrl);
  await report("refine", refineSnap, glb);

  return {
    ok: true,
    glb,
    refineTaskId: refine.data.result,
  };
}

export async function rigHumanoidWalk(opts: {
  apiKey: string;
  refineTaskId: string;
  timeoutMs?: number;
  deadlineAt?: number;
  onStatus?: (message: string) => void;
}): Promise<{ ok: true; glb: Buffer } | { ok: false; error: string }> {
  opts.onStatus?.("Rigging walk cycle");
  const created = await meshyJson<MeshyCreateResponse>(`${MESHY_BASE}/v1/rigging`, {
    method: "POST",
    headers: authHeaders(opts.apiKey),
    body: JSON.stringify({
      input_task_id: opts.refineTaskId,
      height_meters: 1.78,
    }),
  });
  if (!created.ok || !created.data.result) {
    return { ok: false, error: created.ok ? "Meshy rig missing id" : created.error };
  }

  const done = await pollTask({
    url: `${MESHY_BASE}/v1/rigging/${created.data.result}`,
    apiKey: opts.apiKey,
    timeoutMs: remainingMs(opts.deadlineAt, opts.timeoutMs ?? 180_000),
    onProgress: (snapshot) =>
      opts.onStatus?.(`Rigging walk cycle (${snapshot.progress}% ${snapshot.status})`),
  });
  if (!done.ok) return done;

  const walkUrl = done.task.result?.basic_animations?.walking_glb_url;
  const riggedUrl = done.task.result?.rigged_character_glb_url;
  const url = walkUrl || riggedUrl;
  if (!url) return { ok: false, error: "Meshy rig produced no GLB" };

  return { ok: true, glb: await downloadBinary(url) };
}
