// Children's Day (14 November) feed posts (1080x1350 PNG) in the layout of brand/social/childrens-day-template.html.
//   node scripts/social/childrens-day.mjs        → brand/social/out/posts/childrens-day-*.png
// The greeting shows the baby from brand/social/art/baby.svg sitting in front of the four children.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const OUT = path.join(root, "brand/social/out/posts");
const TEMPLATE = pathToFileURL(path.join(root, "brand/social/childrens-day-template.html")).href;
fs.mkdirSync(OUT, { recursive: true });

const POSTS = [
  { file: "childrens-day-1-greeting", layout: "greeting", kicker: "14 NOVEMBER · BAL DIWAS",
    title: "Happy *Children's* Day",
    sub: "To every curious mind, every big dream and every little hand that keeps a classroom alive.",
    note: "Keep wondering. Keep shining.",
    foot: "<b>Team Vidyanexa</b>", baby: true },
  { file: "childrens-day-2-more-time", layout: "hero", kicker: "THIS CHILDREN'S DAY",
    title: "Less time on registers. _More time_ for *children*.",
    sub: "Let Vidyanexa handle the paperwork, so your teachers can do what they love most: teach.",
    points: ["Attendance in 10 seconds", "Parents told the moment it matters", "Fees, notices and homework on one app"] },
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
