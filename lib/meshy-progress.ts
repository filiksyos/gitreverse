export type MeshyTaskSnapshot = {
  status: string;
  progress: number;
  thumbnailUrl?: string;
  glbUrl?: string;
};

export type HeroProgressStage =
  | "preview"
  | "refine"
  | "kernel"
  | "ready"
  | "failed";

export type HeroProgressEvent = {
  id: string;
  kind: "humanoid" | "vehicle" | "prop";
  stage: HeroProgressStage;
  status: string;
  progress: number;
  thumbnailUrl?: string;
  modelUrl?: string;
  kernel?: boolean;
  clips?: string[];
};

export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

/** Map a Meshy task payload to UI fields. Never invent URLs or treat in-flight GLBs as ready. */
export function meshyTaskSnapshot(task: {
  status?: string;
  progress?: number;
  thumbnail_url?: unknown;
  alpha_thumbnail_url?: unknown;
  model_urls?: { glb?: unknown } | null;
}): MeshyTaskSnapshot {
  const status = (task.status ?? "UNKNOWN").toUpperCase();
  const progress =
    typeof task.progress === "number" && Number.isFinite(task.progress)
      ? Math.max(0, Math.min(100, Math.round(task.progress)))
      : 0;
  const snapshot: MeshyTaskSnapshot = { status, progress };
  const thumb =
    httpsUrl(task.alpha_thumbnail_url) ?? httpsUrl(task.thumbnail_url);
  if (thumb) snapshot.thumbnailUrl = thumb;
  if (status === "SUCCEEDED") {
    const glb = httpsUrl(task.model_urls?.glb);
    if (glb) snapshot.glbUrl = glb;
  }
  return snapshot;
}

export function parseHeroProgressEvent(
  value: unknown
): HeroProgressEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<HeroProgressEvent>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (raw.kind !== "humanoid" && raw.kind !== "vehicle" && raw.kind !== "prop") {
    return null;
  }
  if (
    raw.stage !== "preview" &&
    raw.stage !== "refine" &&
    raw.stage !== "kernel" &&
    raw.stage !== "ready" &&
    raw.stage !== "failed"
  ) {
    return null;
  }
  if (typeof raw.status !== "string") return null;
  if (typeof raw.progress !== "number" || !Number.isFinite(raw.progress)) {
    return null;
  }
  const event: HeroProgressEvent = {
    id: raw.id,
    kind: raw.kind,
    stage: raw.stage,
    status: raw.status,
    progress: Math.max(0, Math.min(100, Math.round(raw.progress))),
  };
  const thumb = httpsUrl(raw.thumbnailUrl);
  if (thumb) event.thumbnailUrl = thumb;
  if (typeof raw.modelUrl === "string" && raw.modelUrl.startsWith("/")) {
    event.modelUrl = raw.modelUrl;
  }
  if (raw.kernel) event.kernel = true;
  if (Array.isArray(raw.clips)) {
    event.clips = raw.clips.filter(
      (name): name is string => typeof name === "string"
    );
  }
  return event;
}

export type MeshySseClassification =
  | { kind: "task" }
  | { kind: "http-error"; statusCode: number; message: string }
  | { kind: "ignore" };

/** Meshy message events can include status_code without a task status. That is not a task failure. */
export function classifyMeshySsePayload(payload: unknown): MeshySseClassification {
  if (!payload || typeof payload !== "object") return { kind: "ignore" };
  const raw = payload as Record<string, unknown>;
  const status = typeof raw.status === "string" ? raw.status.trim() : "";
  const statusCode =
    typeof raw.status_code === "number" && Number.isFinite(raw.status_code)
      ? raw.status_code
      : undefined;
  if (status) return { kind: "task" };
  if (statusCode !== undefined && statusCode >= 400) {
    return {
      kind: "http-error",
      statusCode,
      message:
        typeof raw.message === "string" && raw.message.trim()
          ? raw.message
          : "Meshy stream error",
    };
  }
  return { kind: "ignore" };
}

export type MeshyStreamResult =
  | { ok: true }
  | { ok: false; taskFailed?: boolean };

/**
 * Stream is optional. Poll unless the stream finished the Meshy task
 * (SUCCEEDED) or the task itself FAILED/CANCELED.
 */
export function shouldFallBackToPoll(
  streamed: MeshyStreamResult | null | undefined
): boolean {
  if (streamed == null) return true;
  if (streamed.ok) return false;
  return streamed.taskFailed !== true;
}

export function mergeHeroProgress(
  prev: HeroProgressEvent[],
  next: HeroProgressEvent
): HeroProgressEvent[] {
  const index = prev.findIndex((item) => item.id === next.id);
  if (index < 0) return [...prev, next];
  const current = prev[index];
  const merged: HeroProgressEvent = {
    ...current,
    ...next,
    thumbnailUrl: next.thumbnailUrl || current.thumbnailUrl,
    modelUrl: next.modelUrl || current.modelUrl,
    clips: next.clips ?? current.clips,
    kernel: next.kernel ?? current.kernel,
  };
  return prev.map((item, i) => (i === index ? merged : item));
}
