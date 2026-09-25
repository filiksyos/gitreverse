import { track } from "@vercel/analytics";

const CODERABBIT_AFFILIATE_URL = "https://coderabbit.link/filiksyos-destaw";
const CODERABBIT_ICON_URL =
  "https://www.coderabbit.ai/images/CR_mark_orange.svg";

type CodeRabbitBannerProps = {
  className?: string;
  embedded?: boolean;
  placement?:
    | "home-card"
    | "repo-card"
    | "website-card";
};

const BANNER_COPY = {
  default: {
    title: "Cut code review time in half",
    subtitle:
      "CodeRabbit catches bugs before merge — free trial, 2-click install.",
    variant: "default",
  },
  build: {
    title: "Are you gonna build this?",
    subtitle: "make sure you review the code using coderabbit",
    variant: "build",
  },
} as const;

function copyForPlacement(
  placement: NonNullable<CodeRabbitBannerProps["placement"]>
) {
  if (placement === "repo-card" || placement === "website-card") {
    return BANNER_COPY.build;
  }
  return BANNER_COPY.default;
}

export function CodeRabbitBanner({
  className,
  embedded = false,
  placement,
}: CodeRabbitBannerProps) {
  const trackPlacement = placement ?? (embedded ? "home-card" : "repo-card");
  const copy = copyForPlacement(trackPlacement);
  const content = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CODERABBIT_ICON_URL}
        alt=""
        width={32}
        height={32}
        className={`shrink-0 ${embedded ? "h-7 w-7" : "h-8 w-8"}`}
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
        className={`shrink-0 rounded border-[2px] border-zinc-900 bg-[#FF570A] font-semibold text-white ${
          embedded ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
        }`}
      >
        Try free
      </span>
    </>
  );

  const trackClick = () =>
    track("CodeRabbit Click", {
      placement: trackPlacement,
      variant: copy.variant,
    });

  if (embedded) {
    return (
      <a
        href={CODERABBIT_AFFILIATE_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={trackClick}
        className={`group flex items-center gap-3 rounded-lg border-[2px] border-zinc-900/15 bg-white/70 px-3 py-2.5 transition-colors hover:bg-white ${className ?? ""}`}
      >
        {content}
        <span className="sr-only">Sponsored — opens CodeRabbit in a new tab</span>
      </a>
    );
  }

  return (
    <a
      href={CODERABBIT_AFFILIATE_URL}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={trackClick}
      className={`group relative mt-4 block ${className ?? ""}`}
    >
      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
      <div className="relative z-10 flex items-center gap-3 rounded-lg border-[3px] border-zinc-900 bg-white px-4 py-3 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px">
        {content}
      </div>
      <span className="sr-only">Sponsored — opens CodeRabbit in a new tab</span>
    </a>
  );
}
