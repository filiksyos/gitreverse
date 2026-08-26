"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getPlanLabel, type BillingPlan } from "@/lib/billing-config";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_SKIP, isSupabaseAuthConfigured } from "@/lib/supabase-auth";
import { fetchBillingStatus } from "@/lib/subscription-status-client";
import { useAppHref } from "@/lib/use-app-href";
import type { User } from "@supabase/supabase-js";

function IconBooks({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="12" y1="6" x2="16" y2="6" />
      <line x1="12" y1="10" x2="16" y2="10" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconPremiumBadge({ size = 17 }: { size?: number }) {
  const raw = useId();
  const filterId = `nav-premium-${raw.replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feOffset dx="0" dy="0.8" />
          <feGaussianBlur stdDeviation="1.2" result="offset-blur" />
          <feComposite
            operator="out"
            in="SourceGraphic"
            in2="offset-blur"
            result="inverse"
          />
          <feFlood floodColor="#a01209" floodOpacity="0.5" result="color" />
          <feComposite operator="in" in="color" in2="inverse" result="shadow" />
          <feComposite operator="over" in="shadow" in2="SourceGraphic" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path fill="none" d="M0 0h24v24H0z" />
        <path
          fill="#d31611"
          stroke="#a01209"
          strokeWidth="0.5"
          d="m23 12-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"
        />
      </g>
    </svg>
  );
}

function IconLogOut({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const CANCEL_REASON_MIN_LEN = 10;

function userDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    "";
  if (full.trim()) return full.trim();
  const email = user.email?.trim();
  return email ?? "Account";
}

function userInitials(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase() || "?"
    );
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length === 1) {
    return parts[0]!.toUpperCase();
  }
  const email = user.email?.split("@")[0]?.trim();
  if (email && email.length >= 2) return email.slice(0, 2).toUpperCase();
  if (email && email.length === 1) return email.toUpperCase();
  return "?";
}

export type NavbarProps = {
  isSubscriber?: boolean;
  creditBalance?: number;
};

function NavDivider() {
  return (
    <div
      className="mx-1 hidden h-6 w-px shrink-0 bg-zinc-200 sm:block"
      aria-hidden
    />
  );
}

function LibraryNavLink({ isActive, href }: { isActive: boolean; href: string }) {
  const [hov, setHov] = useState(false);
  const shadowShift = hov ? "translate(2px,2px)" : "translate(3px,3px)";
  const btnShift = hov ? "-translate-x-px -translate-y-px" : "";
  const buttonClass = `relative inline-flex items-center gap-1.5 rounded-md border-[2.5px] border-zinc-900 bg-[#fff4da] px-2 py-1.5 text-sm font-bold text-zinc-900 transition-transform duration-100 sm:px-3.5 ${btnShift} ${isActive ? "ring-2 ring-zinc-400" : ""}`;

  return (
    <span
      className="relative isolate inline-flex"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-md bg-zinc-900 transition-transform duration-100"
        style={{ transform: shadowShift }}
        aria-hidden
      />
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={buttonClass}
      >
        <IconBooks />
        <span>Library</span>
      </Link>
    </span>
  );
}

export function Navbar({ isSubscriber: isSubscriberProp, creditBalance: creditBalanceProp }: NavbarProps) {
  const pathname = usePathname();
  const homeHref = useAppHref("/");
  const libraryHref = useAppHref("/library");
  const historyHref = useAppHref("/history");
  const {
    user,
    session,
    isLoading: authLoading,
    signInWithGitHub,
    signOut,
  } = useAuth();
  const authUiEnabled =
    Boolean(!AUTH_SKIP && isSupabaseAuthConfigured());

  const [planFromApi, setPlanFromApi] = useState<BillingPlan>("free");
  const [creditBalanceFromApi, setCreditBalanceFromApi] = useState(0);
  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setPlanFromApi("free");
      setCreditBalanceFromApi(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchBillingStatus(token);
        if (!cancelled) {
          setPlanFromApi(status.plan);
          setCreditBalanceFromApi(status.credits.balance);
        }
      } catch {
        if (!cancelled) {
          setPlanFromApi("free");
          setCreditBalanceFromApi(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const isSubscriber = Boolean(isSubscriberProp) || planFromApi !== "free";
  const creditBalance = creditBalanceProp ?? creditBalanceFromApi;
  const planLabel =
    isSubscriber && isSubscriberProp ? "Premium" : getPlanLabel(planFromApi);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const closeCancelModal = useCallback(() => {
    setCancelOpen(false);
    setCancelReason("");
    setCancelError(null);
    setCancelLoading(false);
    setCancelSuccess(false);
  }, []);

  const handleConfirmCancelSubscription = useCallback(async () => {
    const reason = cancelReason.trim();
    if (reason.length < CANCEL_REASON_MIN_LEN) {
      setCancelError(
        `Please share a bit more detail (at least ${CANCEL_REASON_MIN_LEN} characters).`
      );
      return;
    }

    const token = session?.access_token;
    if (!token) {
      setCancelError("Something went wrong. Try signing out and back in.");
      return;
    }

    setCancelLoading(true);
    setCancelError(null);

    try {
      const res = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cancellation_reason: reason }),
      });

      const data: unknown = await res.json().catch(() => ({}));
      const errMsg = ((): string | null => {
        if (typeof data !== "object" || data === null) return null;
        const o = data as Record<string, unknown>;
        if (typeof o.error === "string" && o.error.trim()) return o.error;
        if (typeof o.message === "string" && o.message.trim()) return o.message;
        return null;
      })();

      if (!res.ok) {
        setCancelError(errMsg || "Could not cancel subscription.");
        setCancelLoading(false);
        return;
      }

      setPlanFromApi("free");
      setCancelSuccess(true);
      setCancelLoading(false);
      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch {
      setCancelError("Network error. Please try again.");
      setCancelLoading(false);
    }
  }, [cancelReason, session?.access_token]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!cancelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCancelModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancelOpen, closeCancelModal]);

  const busySignInRef = useRef(false);
  const handleSignIn = useCallback(async () => {
    if (busySignInRef.current) return;
    busySignInRef.current = true;
    try {
      await signInWithGitHub();
    } catch {
      /* AuthModal elsewhere may surface errors */
    } finally {
      busySignInRef.current = false;
    }
  }, [signInWithGitHub]);

  const menuId = useId();
  const cancelDialogTitleId = useId();
  const cancelDialogDescId = useId();

  return (
    <>
      <nav className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#FFFDF8]">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-1.5 px-3 sm:gap-3 sm:px-6">
        <Link
          href={homeHref}
          className="shrink-0 text-lg font-bold tracking-tight transition-transform hover:-translate-y-0.5 sm:text-xl"
          aria-label="GitReverse home"
        >
          <span className="text-zinc-900">Git</span>
          <span className="text-[#d31611]">Reverse</span>
        </Link>

        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
          <LibraryNavLink isActive={pathname === "/library"} href={libraryHref} />

          <NavDivider />

          {authUiEnabled ? (
            user ? (
              <div className="relative shrink-0" ref={menuRef}>
                <span className="relative isolate inline-flex">
                  <span
                    className="pointer-events-none absolute inset-0 rounded-[6px] bg-zinc-900"
                    style={{ transform: "translate(3px,3px)" }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="relative flex h-9 w-9 items-center justify-center rounded-[6px] border-[2.5px] border-zinc-900 bg-[#d31611] text-xs font-extrabold tracking-tight text-white"
                    aria-expanded={menuOpen}
                    aria-haspopup="true"
                    aria-controls={menuOpen ? menuId : undefined}
                    onClick={() => setMenuOpen((o) => !o)}
                  >
                    {userInitials(user)}
                  </button>
                </span>

                {menuOpen ? (
                  <div
                    id={menuId}
                    className="absolute right-0 top-[calc(100%+12px)] z-[200] min-w-[200px] overflow-hidden rounded-[10px] border-[3px] border-zinc-900 bg-[#FFFDF8]"
                    role="menu"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 rounded-[10px] bg-zinc-900"
                      style={{ transform: "translate(5px,5px)" }}
                      aria-hidden
                    />
                    <div className="relative rounded-[10px] bg-[#FFFDF8]">
                      <div className="border-b-2 border-zinc-200 bg-[#fff4da] px-4 py-3.5">
                        <p className="text-sm font-extrabold tracking-tight text-zinc-900">
                          {userDisplayName(user)}
                        </p>
                        {user.email ? (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {user.email}
                          </p>
                        ) : null}
                        {isSubscriber ? (
                          <span className="mt-2 inline-flex items-center gap-1 rounded border-[1.5px] border-zinc-900 bg-[#fff4da] px-2 py-0.5 text-[11px] font-bold text-zinc-900">
                            <IconPremiumBadge size={12} />
                            {planLabel}
                          </span>
                        ) : null}
                        {creditBalance > 0 ? (
                          <span className="mt-2 inline-flex items-center rounded border-[1.5px] border-zinc-900 bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-900">
                            {creditBalance} credit{creditBalance === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      <Link
                        href={historyHref}
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 border-b-2 border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => setMenuOpen(false)}
                      >
                        <IconClock />
                        History
                      </Link>
                      {isSubscriber ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 border-b-2 border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                          onClick={() => {
                            setMenuOpen(false);
                            setCancelOpen(true);
                            setCancelReason("");
                            setCancelError(null);
                            setCancelSuccess(false);
                          }}
                        >
                          <IconPremiumBadge size={15} />
                          Subscription
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => {
                          setMenuOpen(false);
                          void signOut();
                        }}
                      >
                        <IconLogOut />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : !authLoading ? (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="shrink-0 rounded-md border-[2.5px] border-zinc-900 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-900 hover:bg-zinc-50 sm:px-3 sm:text-sm"
              >
                Sign in
              </button>
            ) : (
              <div
                className="h-9 w-9 shrink-0 rounded-[6px] border-[2.5px] border-zinc-200 bg-zinc-100 animate-pulse"
                aria-hidden
              />
            )
          ) : null}
        </div>
      </div>
    </nav>
    {cancelOpen ? (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-900/40 px-4 py-8"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !cancelLoading && !cancelSuccess)
            closeCancelModal();
        }}
      >
        <div
          className="relative max-h-[min(90vh,520px)] w-full max-w-md overflow-hidden rounded-[10px] border-[3px] border-zinc-900 bg-[#FFFDF8]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={cancelDialogTitleId}
          aria-describedby={cancelDialogDescId}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-[10px] bg-zinc-900"
            style={{ transform: "translate(5px,5px)" }}
            aria-hidden
          />
          <div className="relative max-h-[inherit] overflow-y-auto rounded-[10px] bg-[#FFFDF8]">
            <div className="border-b-2 border-zinc-200 bg-[#fff4da] px-4 py-3.5">
              <h2
                id={cancelDialogTitleId}
                className="text-sm font-extrabold tracking-tight text-zinc-900"
              >
                Cancel subscription
              </h2>
              <p
                id={cancelDialogDescId}
                className="mt-1 text-xs leading-relaxed text-zinc-500"
              >
                Tell us why you&apos;re leaving — your feedback helps us improve.
              </p>
            </div>

            <div className="p-4">
              {cancelSuccess ? (
                <p className="text-sm font-semibold text-zinc-900">
                  Subscription cancelled. Refreshing…
                </p>
              ) : (
                <>
                  <label
                    htmlFor="cancel-reason"
                    className="mb-1.5 block text-xs font-bold text-zinc-700"
                  >
                    Cancellation reason
                  </label>
                  <textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => {
                      setCancelReason(e.target.value);
                      if (cancelError) setCancelError(null);
                    }}
                    disabled={cancelLoading}
                    rows={4}
                    className="block w-full resize-y rounded-md border-[2.5px] border-zinc-900 bg-white px-3 py-2 text-sm text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-60"
                    placeholder="e.g. Not using it enough, switching tools, too expensive…"
                  />
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    At least {CANCEL_REASON_MIN_LEN} characters required.
                  </p>
                  {cancelError ? (
                    <p
                      className="mt-2 text-xs font-semibold text-[#d31611]"
                      role="alert"
                    >
                      {cancelError}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {!cancelSuccess ? (
              <div className="flex flex-col-reverse gap-2 border-t-2 border-zinc-200 bg-[#fffdf8] p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-md border-[2.5px] border-zinc-900 bg-white px-3 py-2 text-sm font-bold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                  disabled={cancelLoading}
                  onClick={closeCancelModal}
                >
                  Keep my subscription
                </button>
                <button
                  type="button"
                  className="rounded-md border-[2.5px] border-zinc-900 bg-[#d31611] px-3 py-2 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
                  disabled={cancelLoading}
                  onClick={() => void handleConfirmCancelSubscription()}
                >
                  {cancelLoading ? "Cancelling…" : "Cancel subscription"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
