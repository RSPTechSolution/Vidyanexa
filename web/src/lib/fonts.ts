import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

// Theme version 4 ("Polished"): one typeface for text, headings and the wordmark, the same as the mobile apps. This is
// the only place to change it; globals.css reads it through --font-ui (body), --font-heading and --font-brand.
// A variable font: one file covers every weight, so headings get their face sooner and reflow less.
export const ui = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap", adjustFontFallback: true });
// Only used for codes and figures deep inside the app, so it isn't preloaded on every page.
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });
