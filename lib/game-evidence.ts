export type GameEvidenceSource = "name-only";

export type GameEvidence = {
  source: GameEvidenceSource;
  name: string;
  slug: string;
  /** Reserved for Steam, RAWG, Wikipedia, screenshots, etc. */
  metadata?: Record<string, unknown> | null;
};

export function evidenceStatusMessage(source: GameEvidenceSource): string {
  switch (source) {
    case "name-only":
      return "Recalling game from model knowledge";
    default:
      return "Gathering game evidence";
  }
}

/**
 * V1: model knowledge only. Future: Wikipedia, RAWG, Steam store page, screenshots.
 */
export async function gatherGameEvidence(opts: {
  name: string;
  slug: string;
}): Promise<GameEvidence> {
  return {
    source: "name-only",
    name: opts.name,
    slug: opts.slug,
    metadata: null,
  };
}
