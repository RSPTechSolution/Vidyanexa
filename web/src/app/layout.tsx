import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { RegisterServiceWorker } from "@/components/pwa";
import { SITE_URL } from "@/lib/site";
import { jetbrains, ui } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Vidyanexa", template: "%s | Vidyanexa" },
  description: "Vidyanexa school management software for Indian schools.",
  applicationName: "Vidyanexa",
  authors: [{ name: "Vidyanexa", url: SITE_URL }],
  creator: "Vidyanexa",
  publisher: "Vidyanexa",
  category: "education",
  formatDetection: { telephone: false, email: false, address: false },
  // Search Console and Bing Webmaster ownership checks, set from the environment when the site goes live.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined,
  },
  // The app is private: nothing behind sign-in should be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9FD" },
    { media: "(prefers-color-scheme: dark)", color: "#121318" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" suppressHydrationWarning className={cn(ui.variable, jetbrains.variable)}>
      {/* Extensions such as Grammarly add attributes to <body> before React loads. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
