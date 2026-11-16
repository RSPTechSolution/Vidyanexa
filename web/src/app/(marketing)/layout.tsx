import type { Metadata } from "next";
import { GoogleAnalytics } from "@/components/marketing/analytics";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { DEFAULT_OG, JsonLd, ORGANIZATION, WEBSITE, graph } from "@/lib/seo";

export const metadata: Metadata = {
  // Public pages are meant to be found (the app itself stays noindex). Each page sets its own title, canonical and cards.
  robots: { index: true, follow: true },
  openGraph: { siteName: "Vidyanexa", type: "website", locale: "en_IN", images: [{ url: DEFAULT_OG, width: 1200, height: 630, alt: "Vidyanexa school management software" }] },
  twitter: { card: "summary_large_image" },
};

// No cookies are read here: that would rebuild every public page for every visitor. The header works out "signed in"
// in the browser, so these pages are built once and served from the CDN.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      <GoogleAnalytics />
      <SmoothScroll />
      <JsonLd data={graph(ORGANIZATION, WEBSITE)} />
    </div>
  );
}
