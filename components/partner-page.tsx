import { Navbar } from "@/components/navbar";
import { PartnerCheckoutForm } from "@/components/partner-checkout-form";
import { SPONSOR_CONTACT, sponsorshipMonthLabel } from "@/lib/sponsorship-config";
import { formatMonthlyVisitors, ownerTrafficSnapshot, snapshotReportedMonth, trafficPeriodLabel, type SponsorTraffic } from "@/lib/sponsorship-analytics";

export function PartnerPage({ checkoutStatus, traffic = null }: { checkoutStatus?: "success" | "cancelled"; traffic?: SponsorTraffic | null }) {
  const snapshot = ownerTrafficSnapshot();
  const snapshotMonth = snapshotReportedMonth(snapshot);
  const monthLabel = sponsorshipMonthLabel(new Date());
  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8 sm:py-20">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Sponsor GitReverse</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Reach a massive<br />developer audience.</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-600">A small, clearly labeled spot for your product, where developers reverse-engineer codebases and websites.</p>
          <dl className="mt-8 grid max-w-lg grid-cols-2 gap-6">
            <div><dd className="text-3xl font-bold tracking-tight sm:text-4xl">250K+</dd><dt className="mt-1 text-sm text-zinc-600">Lifetime visitors</dt></div>
            <div title={traffic ? `${trafficPeriodLabel(traffic)}. Returning visitors may count again on different days.` : `Owner-reported monthly audience, supplied ${snapshotMonth}.`}><dd className="text-3xl font-bold tracking-tight sm:text-4xl">{formatMonthlyVisitors(traffic?.visitors ?? snapshot.visitors)}</dd><dt className="mt-1 text-sm text-zinc-600">{traffic ? "visitors last month" : "Monthly visitors"}</dt></div>
          </dl>
          <p className="mt-3 text-xs text-zinc-400">{traffic ? "Monthly traffic updates hourly" : `Audience snapshot · ${snapshotMonth}`}</p>
        </header>
        <section aria-label="Previous sponsors" className="my-10 border-y border-zinc-200 py-5">
          <p className="text-xs text-zinc-500">Previous sponsors</p>
          <ul className="mt-3 flex flex-wrap gap-x-7 gap-y-4 text-sm font-semibold">
            {[
              { name: "CodeRabbit", icon: "/sponsors/coderabbit.png" },
              { name: "Make.design", icon: "/sponsors/make-design.png" },
              { name: "arcumet.com", icon: "/sponsors/arcumet.png" },
            ].map((sponsor) => <li key={sponsor.name} className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sponsor.icon} alt="" width={24} height={24} className="h-6 w-6 rounded object-contain" />{sponsor.name}
            </li>)}
          </ul>
        </section>
        <section aria-labelledby="sponsorship-heading" id="sponsor-checkout" className="scroll-mt-24">
          <h2 id="sponsorship-heading" className="text-xl font-semibold">Pick a spot</h2>
          <p className="mb-6 mt-2 text-sm text-zinc-600">Your link and a short line of copy. No popups.</p>
          {checkoutStatus === "success" ? <p role="status" className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed">Thanks for returning from Stripe. Payment confirmation is handled securely in the background. Once verified, we’ll contact you to arrange your ad.</p> : checkoutStatus === "cancelled" ? <p role="status" className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm">Checkout was cancelled. You can choose a placement and try again.</p> : null}
          <PartnerCheckoutForm monthLabel={monthLabel} />
        </section>
        <footer className="mt-8 border-t border-zinc-200 pt-6 text-sm leading-relaxed text-zinc-500">Questions, creative, or cancellation? <a href={`mailto:${SPONSOR_CONTACT}`} className="text-zinc-700 underline underline-offset-4">Email us</a>.</footer>
      </main>
    </div>
  );
}
