import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatSponsorPrice, isSponsorshipPlacement, SPONSORSHIP_PLACEMENTS, sponsorshipMonthLabel } from "../lib/sponsorship-config";
import { isPremiumOnlySubscription } from "../lib/premium-subscription";
import { STRIPE_PRICE_IDS } from "../lib/billing-config";

test("sponsorship catalog uses the approved monthly USD amounts", () => {
  assert.deepEqual(Object.values(SPONSORSHIP_PLACEMENTS).map((p) => p.amount), [200000, 200000, 20000, 420000]);
  assert.equal(formatSponsorPrice(SPONSORSHIP_PLACEMENTS.bundle.amount), "$4,200");
  assert.equal(isSponsorshipPlacement("bundle"), true);
  for (const value of ["__proto__", "constructor", "invalid", null, {}, 200]) assert.equal(isSponsorshipPlacement(value), false);
});

test("Premium cancellation excludes sponsorships, unknown prices and mixed subscriptions", () => {
  const subscription = (ids: string[], metadata = {}, has_more = false) => ({ metadata, items: { data: ids.map((id) => ({ price: { id } })), has_more } });
  assert.equal(isPremiumOnlySubscription(subscription([STRIPE_PRICE_IDS.starter])), true);
  assert.equal(isPremiumOnlySubscription(subscription([STRIPE_PRICE_IDS.partner])), false);
  assert.equal(isPremiumOnlySubscription(subscription([STRIPE_PRICE_IDS.readmeSponsor])), false);
  assert.equal(isPremiumOnlySubscription(subscription([STRIPE_PRICE_IDS.starter, "sponsor_price"])), false);
  assert.equal(isPremiumOnlySubscription(subscription([STRIPE_PRICE_IDS.starter], { type: "sponsorship" })), false);
  assert.equal(isPremiumOnlySubscription(subscription([STRIPE_PRICE_IDS.starter], {}, true)), false);
  assert.equal(isPremiumOnlySubscription(subscription([])), false);
});

test("website and codebase reverse both show the original CodeRabbit ad", () => {
  const website = readFileSync("components/website-reverse-page.tsx", "utf8");
  const codebase = readFileSync("components/reverse-prompt-home.tsx", "utf8");
  assert.match(website, /CodeRabbitBanner/);
  assert.match(website, /embedded placement="website-card"/);
  assert.doesNotMatch(website, /Afterpack|afterpack/);
  assert.match(codebase, /CodeRabbitBanner/);
  const banner = readFileSync("components/coderabbit-banner.tsx", "utf8");
  assert.match(banner, /https:\/\/coderabbit.link\/filiksyos-destaw/);
  assert.match(banner, /Are you gonna build this\?/);
  assert.match(banner, /make sure you review the code using coderabbit/);
  assert.match(banner, /Try free/);
});

test("sponsor page uses owner snapshot and doesn't claim payment from a URL", () => {
  const page = readFileSync("components/partner-page.tsx", "utf8");
  assert.doesNotMatch(page, /35,000|1,000\+|3,000\+|Payment received|within 24 hours/);
  assert.match(page, /Once verified/);
});


test("sponsorship month label rolls forward in UTC", () => {
  assert.equal(sponsorshipMonthLabel(new Date("2026-10-08T07:00:00Z")), "October");
  assert.equal(sponsorshipMonthLabel(new Date("2026-10-31T23:59:59Z")), "October");
  assert.equal(sponsorshipMonthLabel(new Date("2026-11-01T00:00:00Z")), "November");
});

test("sponsor page has requested audience snapshot and logos, with contact only below checkout", () => {
  const page = readFileSync("components/partner-page.tsx", "utf8");
  assert.match(page, /Reach a massive/);
  assert.match(page, /250K\+/);
  assert.match(page, /visitors last month/);
  assert.doesNotMatch(page.split("</header>")[0], /mailto:/);
  for (const asset of ["coderabbit.png", "make-design.png", "arcumet.png"]) {
    assert.match(page, new RegExp(asset.replace(".", "\\.")));
    assert.ok(readFileSync(`public/sponsors/${asset}`).length > 100);
  }
  const route = readFileSync("app/partner/page.tsx", "utf8");
  assert.match(route, /permanentRedirect/);
  assert.match(route, /URLSearchParams/);
  assert.match(route, /\/sponsor/);
  assert.match(readFileSync("app/sponsor/page.tsx", "utf8"), /canonical: "\/sponsor"/);
});


test("home footer preserves Discord while claim card sits below the example repos", () => {
  const home = readFileSync("components/reverse-prompt-home.tsx", "utf8");
  const footer = home.slice(home.indexOf("<footer"), home.indexOf("</footer>"));
  assert.match(footer, /href="https:\/\/discord\.gg\/eHN86K7rBj"/);
  assert.match(footer, /Discord/);
  assert.doesNotMatch(footer, /Advertise|Claim spot/);
  assert.match(footer, /href="https:\/\/filiksyos.com"/);
  const examplesEnd = home.indexOf("Advertise your website");
  assert.ok(examplesEnd > home.indexOf("Try example repos:"));
  assert.ok(examplesEnd < home.indexOf("</form>"));
  const card = home.slice(examplesEnd, home.indexOf("</form>"));
  assert.match(card, /href="\/sponsor"/);
  assert.match(card, /Claim spot/);
  assert.doesNotMatch(home, /Sponsor this spot/);
});


