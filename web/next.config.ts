import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Google Analytics (public website only) when NEXT_PUBLIC_GA_ID is set.
const ga = process.env.NEXT_PUBLIC_GA_ID ? " https://www.googletagmanager.com https://*.google-analytics.com" : "";

// CSS, JS and fonts from a CDN domain (e.g. https://cdn.vidyanexa.com, pointed at this same site) when ASSET_PREFIX is
// set at build time; uploaded files from the media domain (e.g. https://media.vidyanexa.com) when NEXT_PUBLIC_MEDIA_URL
// is. Either can be left empty: then everything comes from the site itself, as before.
const assetPrefix = (process.env.ASSET_PREFIX ?? "").replace(/\/+$/, "");
const cdn = assetPrefix ? ` ${new URL(assetPrefix).origin}` : "";
const media = process.env.NEXT_PUBLIC_MEDIA_URL ? ` ${new URL(process.env.NEXT_PUBLIC_MEDIA_URL).origin}` : "";

// All API traffic goes through same-origin route handlers, so connect-src can stay 'self'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${cdn}${ga}`,
  `style-src 'self' 'unsafe-inline'${cdn}`,
  // Map tiles (transport tracking), files the API serves publicly (a school's logo), and uploaded files on the media domain.
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${new URL(process.env.API_URL ?? "http://localhost:8000").origin}${media}${cdn}${ga}`,
  `media-src 'self'${media}`,
  `font-src 'self' data:${cdn}`,
  `connect-src 'self'${isDev ? " ws:" : ""}${ga}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Lets a production build run next to `npm run dev` without sharing `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Built CSS, JS and fonts are linked from the CDN domain (only in production builds; development stays local).
  assetPrefix: assetPrefix && !isDev ? assetPrefix : undefined,
  // Docker images run the self-contained server (see web/Dockerfile).
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  // AVIF is about a fifth smaller than WebP for the screenshots on the public site.
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      // Fonts and scripts loaded from the CDN domain are cross-origin: let the site (and only from there) use them.
      ...(assetPrefix ? [{ source: "/_next/static/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_SITE_URL ?? "*" }] }] : []),
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
