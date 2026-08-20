import { notFound } from "next/navigation";
import { GameReversePage } from "@/components/game-reverse-page";
import {
  isValidGameSlug,
  nameToSlug,
  parseGameInput,
} from "@/lib/parse-game-input";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ name?: string }>;
};

export default async function GameSlugPage({
  params,
  searchParams,
}: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();
  const { name: rawName } = await searchParams;

  if (!isValidGameSlug(slug)) {
    notFound();
  }

  const parsed = rawName ? parseGameInput(rawName) : null;
  if (!parsed) {
    notFound();
  }

  if (nameToSlug(parsed.name) !== slug) {
    notFound();
  }

  return <GameReversePage gameSlug={slug} gameName={parsed.name} />;
}
