import { NextRequest, NextResponse } from "next/server";
import { isValidGameSlug } from "@/lib/parse-game-input";
import {
  ensureGameReversed,
  type GameReverseResult,
} from "@/lib/game-reverse-engine";
import { readGameReverse } from "@/lib/game-reverse-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const ROUTE_TIMEOUT_MS = 240_000;
const inFlight = new Map<string, Promise<GameReverseResult>>();

function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function executeGameReverse(opts: {
  slug: string;
  gameName: string;
  stream: boolean;
  force?: boolean;
}): Promise<NextResponse> {
  const { slug, gameName, stream, force } = opts;

  if (!stream) {
    const existing = inFlight.get(slug);
    if (existing) {
      const result = await existing;
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        prompt: result.prompt,
        specPath: result.specPath,
        fromCache: result.fromCache,
      });
    }

    const promise = ensureGameReversed({ slug, gameName, force });
    inFlight.set(slug, promise);
    try {
      const result = await promise;
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        prompt: result.prompt,
        specPath: result.specPath,
        fromCache: result.fromCache,
      });
    } finally {
      inFlight.delete(slug);
    }
  }

  const encoder = new TextEncoder();
  const streamBody = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };

      try {
        const result = await ensureGameReversed({
          slug,
          gameName,
          force,
          onStatus: (message) => send("status", { message }),
        });

        if (!result.ok) {
          send("error", { error: result.error });
          controller.close();
          return;
        }

        send("done", {
          prompt: result.prompt,
          specPath: result.specPath,
          fromCache: result.fromCache,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(streamBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  let body: {
    gameSlug?: string;
    gameName?: string;
    stream?: boolean;
    force?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const gameSlug = body.gameSlug?.trim().toLowerCase();
  if (!gameSlug || !isValidGameSlug(gameSlug)) {
    return NextResponse.json(
      { error: "gameSlug is required and must be a valid slug." },
      { status: 400 }
    );
  }

  let gameName = body.gameName?.trim();
  if (!gameName) {
    const cached = await readGameReverse(gameSlug);
    if (cached?.meta.gameName) {
      gameName = cached.meta.gameName;
    }
  }

  if (!gameName) {
    return NextResponse.json(
      { error: "gameName is required for the first run." },
      { status: 400 }
    );
  }

  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("__timeout__")), ROUTE_TIMEOUT_MS)
  );

  try {
    return await Promise.race([
      executeGameReverse({
        slug: gameSlug,
        gameName,
        stream: body.stream === true,
        force: body.force === true,
      }),
      timer,
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "__timeout__") {
      return NextResponse.json(
        { error: "Game reverse timed out. Try again." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
