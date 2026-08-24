"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KERNEL_PREVIEW_CLIPS,
  QUATERNIUS_STANDARD_PUBLIC_PATH,
  type QuaterniusClip,
} from "@/lib/quaternius-kernel";

type HeroKernelPreviewProps = {
  modelUrl?: string | null;
  title?: string;
  subtitle?: string;
  autoClip?: QuaterniusClip;
};

export function HeroKernelPreview({
  modelUrl,
  title = "Quaternius kernel",
  subtitle,
  autoClip = "Idle_Loop",
}: HeroKernelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [clip, setClip] = useState<string>(autoClip);
  const [available, setAvailable] = useState<string[]>([...KERNEL_PREVIEW_CLIPS]);
  const [status, setStatus] = useState("Loading kernel…");
  const [error, setError] = useState<string | null>(null);
  const playClipRef = useRef<(name: string) => void>(() => {});

  const src = modelUrl || QUATERNIUS_STANDARD_PUBLIC_PATH;
  const clipButtons = useMemo(() => {
    const preferred = KERNEL_PREVIEW_CLIPS.filter((name) =>
      available.includes(name)
    );
    return preferred.length ? preferred : available.slice(0, 12);
  }, [available]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let renderer: import("three").WebGLRenderer | null = null;
    let mixer: import("three").AnimationMixer | null = null;
    let frame = 0;
    let onResize: (() => void) | null = null;

    async function boot() {
      setError(null);
      setStatus("Loading kernel…");
      const THREE = await import("three");
      const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js"
      );
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      if (disposed || !canvas) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf6efe2);

      const camera = new THREE.PerspectiveCamera(
        35,
        canvas.clientWidth / Math.max(1, canvas.clientHeight),
        0.05,
        50
      );
      camera.position.set(2.4, 1.4, 3.2);

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;

      const hemi = new THREE.HemisphereLight(0xfff4da, 0x6b5a44, 1.1);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(2.2, 4, 3);
      key.castShadow = true;
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xffffff, 0.25));

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(3.2, 48),
        new THREE.MeshStandardMaterial({
          color: 0xe8d7b8,
          roughness: 1,
          metalness: 0,
        })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const controls = new OrbitControls(camera, canvas);
      controls.target.set(0, 0.95, 0);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minDistance = 1.2;
      controls.maxDistance = 7;

      const gltf = await new GLTFLoader().loadAsync(src);
      if (disposed) return;

      const root = gltf.scene;
      root.traverse((obj) => {
        const mesh = obj as import("three").Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      scene.add(root);

      const clips = gltf.animations ?? [];
      const names = clips.map((c) => c.name).filter(Boolean);
      setAvailable(names.length ? names : [...KERNEL_PREVIEW_CLIPS]);

      mixer = new THREE.AnimationMixer(root);
      const actions = new Map<string, import("three").AnimationAction>();
      for (const c of clips) {
        const action = mixer.clipAction(c);
        action.enabled = true;
        actions.set(c.name, action);
      }

      playClipRef.current = (name: string) => {
        if (!mixer) return;
        const next = actions.get(name);
        if (!next) {
          setStatus(`Missing clip ${name}`);
          return;
        }
        for (const action of actions.values()) {
          if (action !== next) action.fadeOut(0.18);
        }
        next.reset().fadeIn(0.18).play();
        setStatus(name);
      };

      const initial =
        actions.get(autoClip)?.getClip().name ??
        names.find((n) => n === "Idle_Loop") ??
        names[0];
      if (initial) {
        setClip(initial);
        playClipRef.current(initial);
      } else {
        setStatus("Loaded mesh, no clips");
      }

      const clock = new THREE.Clock();
      onResize = () => {
        if (!renderer || !canvas) return;
        const w = Math.max(1, canvas.clientWidth);
        const h = Math.max(1, canvas.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      onResize();
      window.addEventListener("resize", onResize);

      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        const dt = clock.getDelta();
        mixer?.update(dt);
        controls.update();
        renderer?.render(scene, camera);
      };
      tick();
    }

    const cleanupPromise = boot().catch((e) => {
      if (!disposed) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("Failed to load");
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (onResize) window.removeEventListener("resize", onResize);
      playClipRef.current = () => {};
      mixer?.stopAllAction();
      renderer?.dispose();
      void cleanupPromise;
    };
  }, [src, autoClip]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {subtitle ?? "Quaternius Universal Animation Library kernel"}
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500" role="status">
          {error ? error : status}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-lg border-[3px] border-zinc-900 bg-[#f6efe2]">
        <canvas
          ref={canvasRef}
          className="block h-[22rem] w-full"
          aria-label="Animated hero preview"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {clipButtons.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setClip(name);
                playClipRef.current(name);
              }}
              className={`rounded border-[2px] px-2 py-1 text-[11px] font-medium ${
                clip === name
                  ? "border-zinc-900 bg-[#ffc480] text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900"
              }`}
            >
              {name.replace(/_Loop$/, "").replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
