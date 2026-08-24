import type { Metadata } from "next";
import { KernelLabPage } from "@/components/kernel-lab-page";

export const metadata: Metadata = {
  title: "Quaternius movement kernel",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KernelLabPage />;
}
