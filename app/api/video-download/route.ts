import { isInstagramMediaUrl, parseInstagramReel } from "@/lib/instagram-reel";

export const runtime = "nodejs";
export const maxDuration = 120;

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });
  let input: unknown;
  try {
    input = (await request.json()).url;
  } catch {
    return fail("Enter a valid Instagram reel URL.", 400);
  }
  const shortcode = typeof input === "string" ? parseInstagramReel(input) : null;
  if (!shortcode) return fail("Use a public Instagram reel link, such as https://www.instagram.com/reel/ABC123/.", 400);
  const key = process.env.SEARCHAPI_API_KEY?.trim();
  if (!key) return fail("Video downloads are not configured yet. Please try again later.", 503);

  try {
    const apiUrl = new URL("https://www.searchapi.io/api/v1/search");
    apiUrl.searchParams.set("engine", "instagram_post");
    apiUrl.searchParams.set("post_id", shortcode);
    const result = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!result.ok) return fail("Could not retrieve this reel. Please try again shortly.", 502);
    const data = await result.json();
    const post = data.post;
    if (!post || !["reel", "video"].includes(post.type) || typeof post.link !== "string") {
      return fail("No video found. Make sure the link is a public Instagram reel or video.", 422);
    }
    if (!isInstagramMediaUrl(post.link)) return fail("The video download URL is unavailable.", 502);
    const video = await fetch(post.link, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!video.ok || !video.body || !video.headers.get("content-type")?.startsWith("video/")) {
      await video.body?.cancel();
      return fail("Instagram could not serve this video. Please try again.", 502);
    }
    return new Response(video.body, {
      headers: {
        ...noStore,
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="instagram-${shortcode}.mp4"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return fail("The download could not finish. Please try again.", 502);
  }
}
