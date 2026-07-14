import { NextRequest, NextResponse } from "next/server";
import { parseWebsiteReverseHost } from "@/lib/parse-website-reverse-host";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  // Redirect www.something.gitreverse.com → something.gitreverse.com
  // (Vercel nameservers issue individual certs for each subdomain, so the
  //  SSL handshake succeeds, then we strip the www. here)
  if (hostname.endsWith(".gitreverse.com")) {
    const sub = hostname.slice(0, -".gitreverse.com".length);
    if (sub.startsWith("www.")) {
      const withoutWww = sub.slice(4);
      const url = request.nextUrl.clone();
      url.host = `${withoutWww}.gitreverse.com`;
      return NextResponse.redirect(url, 301);
    }
  }

  const parsed = parseWebsiteReverseHost(host);
  if (!parsed) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/website/${encodeURIComponent(parsed.slug)}`;
  url.searchParams.set("url", parsed.targetUrl);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|opengraph-image).*)"],
};
