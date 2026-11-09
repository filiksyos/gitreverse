import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseSponsorTraffic } from "@/lib/sponsorship-analytics";
import { PartnerPage } from "@/components/partner-page";

export const metadata: Metadata = {
  title: "Sponsor GitReverse",
  description:
    "Sponsor GitReverse with a small placement in codebase reverse, website reverse, or the GitHub README.",
  alternates: { canonical: "/sponsor" },
  robots: { index: false, follow: false },
};

// Server route only: credentials and raw analytics never enter the client bundle.
// Return only aggregates; failed/unavailable reads are cached too, avoiding retry storms.
const getCachedAudience = unstable_cache(async () => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("get_sponsorship_audience").abortSignal(AbortSignal.timeout(15000));
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}, ["sponsorship-audience-v2"], { revalidate: 3600 });

type PartnerRouteProps = {
  searchParams: Promise<{ checkout?: string }>;
};

export default async function PartnerRoute({ searchParams }: PartnerRouteProps) {
  const params = await searchParams;
  const checkoutStatus =
    params.checkout === "success"
      ? "success"
      : params.checkout === "cancelled"
        ? "cancelled"
        : undefined;

  const now = new Date();
  const traffic = parseSponsorTraffic(await getCachedAudience(), now);
  return <PartnerPage checkoutStatus={checkoutStatus} traffic={traffic} />;
}
