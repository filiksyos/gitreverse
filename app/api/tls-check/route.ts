import { NextRequest, NextResponse } from "next/server";

/**
 * Caddy on-demand TLS authorization endpoint.
 * Caddy calls GET /api/tls-check?domain=<hostname> before issuing a cert.
 * Return 200 to allow, anything else to deny.
 *
 * This prevents attackers from burning our Let's Encrypt rate limit by
 * pointing arbitrary domains at our Caddy proxy.
 */
export function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain") ?? "";
  const hostname = domain.split(":")[0].toLowerCase();

  const allowed =
    hostname.endsWith(".gitreverse.com") &&
    // must have at least one subdomain label before .gitreverse.com
    hostname !== ".gitreverse.com";

  if (allowed) {
    return new NextResponse("ok", { status: 200 });
  }

  return new NextResponse("denied", { status: 400 });
}
