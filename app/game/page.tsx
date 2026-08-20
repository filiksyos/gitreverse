import type { Metadata } from "next";
import { GameReverseHome } from "@/components/game-reverse-home";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Game Reverse — GitReverse",
  description:
    "Reverse engineer any game into a GAME.md spec and a Cursor-ready build prompt.",
  alternates: { canonical: "https://gitreverse.com/game" },
  openGraph: {
    title: "Game Reverse — GitReverse",
    description:
      "Reverse engineer any game into a GAME.md spec and a Cursor-ready build prompt.",
    url: "https://gitreverse.com/game",
  },
  twitter: {
    title: "Game Reverse — GitReverse",
    description:
      "Reverse engineer any game into a GAME.md spec and a Cursor-ready build prompt.",
  },
};

const gameJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Game Reverse — GitReverse",
  url: "https://gitreverse.com/game",
  description:
    "Reverse engineer any game into a GAME.md spec and a Cursor-ready build prompt.",
  isPartOf: {
    "@type": "WebSite",
    name: "GitReverse",
    url: "https://gitreverse.com",
  },
};

export default function GamePage() {
  return (
    <>
      <JsonLd data={gameJsonLd} />
      <GameReverseHome />
    </>
  );
}
