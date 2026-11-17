import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gitreverse.com"),
  title: {
    default: "GitReverse",
    template: "%s | GitReverse",
  },
  description:
    "Reverse engineer any GitHub repository into a plain-language coding agent prompt you can build from.",
  openGraph: {
    type: "website",
    siteName: "GitReverse",
    title: "GitReverse",
    description:
      "Reverse engineer any GitHub repository into a plain-language coding agent prompt you can build from.",
    url: "https://gitreverse.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "GitReverse",
    description:
      "Reverse engineer any GitHub repository into a plain-language coding agent prompt you can build from.",
  },
  other: {
    "impact-site-verification": "daff38b7-bd21-4b50-bbbc-bdf3b0e4c564",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-[#fffdf8] antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
