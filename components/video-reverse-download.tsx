"use client";

import { useState } from "react";
import { parseInstagramReel } from "@/lib/instagram-reel";

export function VideoReverseDownload() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setDownloaded(false);
    const shortcode = parseInstagramReel(url);
    if (!shortcode) {
      setError("Paste a public Instagram reel link.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/video-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed. Please try again.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `instagram-${shortcode}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setDownloaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={download} className="w-full max-w-2xl rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6 shadow-[8px_8px_0_0_#18181b]">
      <label htmlFor="reel-url" className="mb-3 block font-bold">Download an Instagram reel</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="reel-url" type="url" required autoComplete="off" value={url} onChange={(event) => { setUrl(event.target.value); setError(null); setDownloaded(false); }} placeholder="https://www.instagram.com/reel/…" className="min-w-0 flex-1 rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base" />
        <button type="submit" disabled={loading} aria-busy={loading} className="rounded border-[3px] border-zinc-900 bg-[#d31611] px-5 py-3 font-bold text-white disabled:opacity-60">{loading ? "Downloading…" : "Download Reel"}</button>
      </div>
      <p className="mt-3 text-sm text-zinc-600">Paste a public Instagram reel link to save the video.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p role="status" className="mt-3 text-sm text-zinc-700">{loading ? "Preparing your video download…" : downloaded ? "Your video download has started." : ""}</p>
    </form>
  );
}
