// Christmas and New Year feed posts (1080x1350 PNG) in the layout of brand/social/season-template.html. No app screens.
//   node scripts/social/season.mjs        → brand/social/out/posts/season-*.png
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const OUT = path.join(root, "brand/social/out/posts");
const TEMPLATE = pathToFileURL(path.join(root, "brand/social/season-template.html")).href;
fs.mkdirSync(OUT, { recursive: true });

const POSTS = [
  { file: "season-1-christmas", theme: "christmas", layout: "greeting", kicker: "WISHING YOU A",
    title: "Merry *Christmas*",
    sub: "May the season bring warmth, rest and happy moments to every student, teacher and family.",
    foot: "<b>Team Vidyanexa</b>" },
  { file: "season-2-new-year", theme: "newyear", layout: "greeting", kicker: "HAPPY NEW YEAR",
    title: "Here's to a *brilliant*", big: "2027",
    sub: "New goals, new lessons, new beginnings. Thank you for growing with us.",
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
