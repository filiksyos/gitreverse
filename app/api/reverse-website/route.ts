import { NextRequest, NextResponse } from "next/server";
import { isValidWebsiteSlug, parseWebsiteInput, urlToSlug } from "@/lib/parse-website-input";
import {
  ensureWebsiteReversed,
  type WebsiteReverseResult,
} from "@/lib/website-reverse-engine";
import { readWebsiteReverse } from "@/lib/website-reverse-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const ROUTE_TIMEOUT_MS = 240_000;
const inFlight = new Map<string, Promise<WebsiteReverseResult>>();

function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function executeWebsiteReverse(opts: {
  slug: string;
  targetUrl: string;
  stream: boolean;
  force?: boolean;
}): Promise<NextResponse> {
  const { slug, targetUrl, stream, force } = opts;

  if (!stream) {
    const existing = inFlight.get(slug);
    if (existing) {
      const result = await existing;
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        prompt: result.prompt,
        designPath: result.designPath,
        fromCache: result.fromCache,
      });
    }

    const promise = ensureWebsiteReversed({ slug, targetUrl, force });
    inFlight.set(slug, promise);
    try {
      const result = await promise;
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        prompt: result.prompt,
        designPath: result.designPath,
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
        const result = await ensureWebsiteReversed({
          slug,
          targetUrl,
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
          designPath: result.designPath,
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
    siteSlug?: string;
    targetUrl?: string;
    stream?: boolean;
    force?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body.siteSlug !== undefined && typeof body.siteSlug !== "string") ||
      (body.targetUrl !== undefined && typeof body.targetUrl !== "string")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Refreshes overwrite shared generated content and require explicit admin access.
  if (body.force === true) {
    const secret = process.env.ADMIN_SECRET?.trim();
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized refresh." }, { status: 403 });
    }
  }

  const siteSlug = body.siteSlug?.trim().toLowerCase();
  if (!siteSlug || !isValidWebsiteSlug(siteSlug)) {
    return NextResponse.json(
      { error: "siteSlug is required and must be a valid slug." },
      { status: 400 }
    );
  }

  let targetUrl = body.targetUrl?.trim();
  if (!targetUrl) {
    const cached = await readWebsiteReverse(siteSlug);
    if (cached?.meta.targetUrl) {
      targetUrl = cached.meta.targetUrl;
    }
  }

  if (!targetUrl) {
    return NextResponse.json(
      { error: "targetUrl is required for the first run." },
      { status: 400 }
    );
  }

  const parsed = parseWebsiteInput(targetUrl);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Could not parse website URL. Use https://example.com or example.com.",
      },
      { status: 400 }
    );
  }

  if (urlToSlug(parsed.hostname) !== siteSlug) {
    return NextResponse.json({ error: "Website slug does not match URL." }, { status: 400 });
  }

  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("__timeout__")), ROUTE_TIMEOUT_MS)
  );

  try {
    return await Promise.race([
      executeWebsiteReverse({
        slug: siteSlug,
        targetUrl: parsed.url,
        stream: body.stream === true,
        force: body.force === true,
      }),
      timer,
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "__timeout__") {
      return NextResponse.json(
        { error: "Website reverse timed out. Try again." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
