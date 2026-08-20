"use client";

import { useEffect, useState } from "react";

const ELLIPSIS_MS = 450;
const FLAVOR_MS = 2400;

/** Rotating filler copy shown while the GAME.md LLM call is in flight. */
const GAME_SPEC_FLAVOR_LINES = [
  "mapping the core loop",
  "picking the right stack",
  "scoping the vertical slice",
  "defining controls and camera",
  "sketching the world palette",
  "writing architecture rules",
  "listing do and don't guardrails",
  "planning implementation order",
  "tuning arcade feel defaults",
  "drafting procedural world tiers",
  "checking genre fit",
  "polishing GAME.md",
  "almost done with the game spec",
] as const;

const ELLIPSIS_FRAMES = ["", ".", "..", "..."] as const;

export function GameSpecFlavorText() {
  const [flavorIndex, setFlavorIndex] = useState(0);
  const [ellipsisIndex, setEllipsisIndex] = useState(0);

  useEffect(() => {
    const ellipsisId = window.setInterval(() => {
      setEllipsisIndex((i) => (i + 1) % ELLIPSIS_FRAMES.length);
    }, ELLIPSIS_MS);

    const flavorId = window.setInterval(() => {
      setFlavorIndex((i) => (i + 1) % GAME_SPEC_FLAVOR_LINES.length);
    }, FLAVOR_MS);

    return () => {
      window.clearInterval(ellipsisId);
      window.clearInterval(flavorId);
    };
  }, []);

  const line = GAME_SPEC_FLAVOR_LINES[flavorIndex] ?? GAME_SPEC_FLAVOR_LINES[0];
  const dots = ELLIPSIS_FRAMES[ellipsisIndex] ?? "";

  return (
    <p
      className="min-h-[1.25rem] text-sm text-zinc-600"
      role="status"
      aria-live="polite"
    >
      {line}
      <span className="inline-block min-w-[1.25em] font-mono tabular-nums text-zinc-500">
        {dots}
      </span>
    </p>
  );
}
