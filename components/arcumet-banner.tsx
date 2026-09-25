import { track } from "@vercel/analytics";

const ARCUMET_JOIN_URL = "https://arcumet.com/join/gitreverse";
const ARCUMET_ICON_URL = "/arcumet-icon.png";

type ArcumetBannerProps = {
  className?: string;
  embedded?: boolean;
  placement?: "home-card" | "repo-card" | "website-card";
  /** GitHub repository URL appended to the GitReverse referral link. */
  repoUrl?: string;
};

const BANNER_COPY = {
  default: {
    title: "Cut code review time in half",
    subtitle:
      "Arcumet catches bugs before merge — free trial, 2-click install.",
    variant: "default",
  },
  build: {
    title: "Are you gonna build this?",
    subtitle: "make sure you review the code using arcumet",
    variant: "build",
  },
} as const;

function copyForPlacement(
  placement: NonNullable<ArcumetBannerProps["placement"]>
) {
  if (placement === "repo-card" || placement === "website-card") {
    return BANNER_COPY.build;
  }
  return BANNER_COPY.default;
}

function arcumetHref(repoUrl?: string) {
  const url = new URL(ARCUMET_JOIN_URL);
  url.searchParams.set("utm_source", "gitreverse");
  url.searchParams.set("utm_medium", "partner");
  url.searchParams.set("utm_campaign", "launch");
  const repo = repoUrl?.trim();
  if (repo) url.searchParams.set("repo", repo);
  return url.toString();
}

export function ArcumetBanner({
  className,
  embedded = false,
  placement,
  repoUrl,
}: ArcumetBannerProps) {
  const trackPlacement = placement ?? (embedded ? "home-card" : "repo-card");
  const copy = copyForPlacement(trackPlacement);
  const href = arcumetHref(repoUrl);
  const content = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ARCUMET_ICON_URL}
        alt=""
        width={32}
        height={32}
        className={`shrink-0 rounded-lg bg-[#0d0f14] object-cover ${embedded ? "h-7 w-7" : "h-8 w-8"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={`font-semibold text-zinc-900 ${embedded ? "text-xs" : "text-sm"}`}
        >
          {copy.title}
        </p>
        {copy.subtitle ? (
          <p
            className={`text-zinc-600 ${embedded ? "text-[11px]" : "text-xs"}`}
          >
            {copy.subtitle}
          </p>
        ) : null}
      </div>
      <span
        className={`shrink-0 rounded border-[2px] border-zinc-900 bg-[linear-gradient(135deg,#3c83f6_0%,#1d4ded_100%)] font-semibold text-white ${
          embedded ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
        }`}
      >
        Try free
      </span>
    </>
  );

  const trackClick = () =>
    track("Arcumet Click", {
      placement: trackPlacement,
      variant: copy.variant,
    });

  if (embedded) {
    return (
      <a
        href={href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={trackClick}
        className={`group flex items-center gap-3 rounded-lg border-[2px] border-zinc-900/15 bg-white/70 px-3 py-2.5 transition-colors hover:bg-white ${className ?? ""}`}
      >
        {content}
        <span className="sr-only">Sponsored — opens Arcumet in a new tab</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={trackClick}
      className={`group relative mt-4 block ${className ?? ""}`}
    >
      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
      <div className="relative z-10 flex items-center gap-3 rounded-lg border-[3px] border-zinc-900 bg-white px-4 py-3 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px">
        {content}
      </div>
      <span className="sr-only">Sponsored — opens Arcumet in a new tab</span>
    </a>
  );
}
