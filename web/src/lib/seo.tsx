import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

/* Search-engine helpers for the public website: page metadata with canonical URLs and share cards, and schema.org data. */

export const BRAND = "Vidyanexa";
export const DEFAULT_OG = "/og/vidyanexa.png";

/** Absolute URL for a site path ("/pricing" -> "https://site/pricing"); the home page has no trailing slash. */
export function absolute(path: string) {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * Metadata for one public page: a title (the layout adds "| Vidyanexa"), a description of about 150 characters,
 * the canonical URL, en-IN language links, and Open Graph and Twitter cards.
 */
export function pageMetadata({
  title, description, path, keywords = [], image = DEFAULT_OG, absoluteTitle = false, noindex = false, type = "website",
}: {
  title: string; description: string; path: string; keywords?: string[]; image?: string; absoluteTitle?: boolean; noindex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const url = absolute(path);
  const fullTitle = absoluteTitle ? title : `${title} | ${BRAND}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: url, languages: { "en-IN": url, "x-default": url } },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      type, url, title: fullTitle, description, siteName: BRAND, locale: "en_IN",
      images: [{ url: image, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] },
  };
}

/** A JSON-LD block. Rendered on the server, so search engines read it without running scripts. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: BRAND,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/icon-512.png`, width: 512, height: 512 },
  description: "School management software for Indian schools: admissions, attendance, fees, exams, transport, HR and parent communication.",
  areaServed: { "@type": "Country", name: "India" },
};

export const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: BRAND,
  inLanguage: "en-IN",
  publisher: { "@id": `${SITE_URL}/#organization` },
};

/** A monthly price quoted without GST (18% is added on the invoice). */
const monthly = (price: string) => ({
  "@type": "UnitPriceSpecification", price, priceCurrency: "INR", unitText: "MONTH", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" }, valueAddedTaxIncluded: false,
});

/** The product, with the public plan prices (INR per month, excluding GST), for rich results. */
export const SOFTWARE = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: `${BRAND} School Management Software`,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "School management system (ERP)",
  operatingSystem: "Web, Android, iOS",
  url: SITE_URL,
  image: `${SITE_URL}${DEFAULT_OG}`,
  description:
    "Cloud school management software (school ERP) for Indian schools: admissions, attendance, fee collection with receipts, exams and report cards, GPS bus tracking, HR and payroll, library, gate security, and parent, staff and driver apps.",
  publisher: { "@id": `${SITE_URL}/#organization` },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "INR",
    lowPrice: "2999",
    highPrice: "17999",
    offerCount: 3,
    offers: [
      { "@type": "Offer", name: "Basic", price: "2999", priceCurrency: "INR", url: `${SITE_URL}/pricing`, priceSpecification: monthly("2999") },
      { "@type": "Offer", name: "Pro", price: "7999", priceCurrency: "INR", url: `${SITE_URL}/pricing`, priceSpecification: monthly("7999") },
      { "@type": "Offer", name: "Max", price: "17999", priceCurrency: "INR", url: `${SITE_URL}/pricing`, priceSpecification: monthly("17999") },
    ],
  },
};

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, item: absolute(it.path),
    })),
  };
}

export function faqPage(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
}

/** Wrap several schema.org nodes in one graph. */
export function graph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
