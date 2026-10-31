// Diwali feed posts (1080x1350 PNG) in the layout of brand/social/diwali-template.html. No app screens needed.
//   node scripts/social/diwali.mjs        → brand/social/out/posts/diwali-*.png
//
// The offer is what every school already gets: a free 14-day trial without a card, and 2 months free when paying
// yearly (10 months charged for 12). Prices are the yearly plan prices per month, as on the pricing page.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const OUT = path.join(root, "brand/social/out/posts");
const TEMPLATE = pathToFileURL(path.join(root, "brand/social/diwali-template.html")).href;
fs.mkdirSync(OUT, { recursive: true });

const POSTS = [
  { file: "diwali-1-light-up", layout: "hero", kicker: "DIWALI OFFER",
    title: "This Diwali, *light up* your school.",
    sub: "Attendance, fees, exams, transport and a parent app: your whole school on one system, set up in minutes.",
    pill: "✦ Start free today",
    points: ["Free for 14 days, no card needed", "Apps for parents, teachers and drivers", "Made for Indian schools, priced in rupees"] },
  { file: "diwali-2-offer", layout: "offer", kicker: "DIWALI OFFER",
    title: "Pay yearly, get",
    sub: "Pay for 10 months, use all 12.",
    plans: [
      { name: "Basic", note: "Up to 300 students", price: "₹2,499", per: "/month, billed yearly" },
      { name: "Pro", note: "Up to 1,500 students", price: "₹6,666", per: "/month, billed yearly" },
      { name: "Max", note: "Unlimited students", price: "₹14,999", per: "/month, billed yearly" },
    ] },
  { file: "diwali-3-shubh-aarambh", layout: "hero", kicker: "SHUBH AARAMBH",
    title: "New account books. *A new way* to run your school.",
    sub: "Diwali is the day for new beginnings. Move your registers, fee books and notices to Vidyanexa, and start fresh.",
    pill: "✦ Your school, set up in 2 minutes",
    points: ["Import students and staff from a spreadsheet", "Fees, receipts and reminders from day one"] },
  { file: "diwali-4-greeting", layout: "greeting", kicker: "WISHING YOU A",
    title: "Happy *Diwali*",
    sub: "May this festival of lights bring joy, learning and success to every student, teacher and family.",
    foot: "<b>Team Vidyanexa</b>" },
];

const browser = await chromium.launch();
for (const p of POSTS) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } }); // fresh page: the template reads its settings once
  await page.goto(`${TEMPLATE}#${encodeURIComponent(JSON.stringify(p))}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${p.file}.png`) });
  console.log(`${p.file}.png`);
  await page.close();
}
await browser.close();
