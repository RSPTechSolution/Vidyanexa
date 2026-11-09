// December feed posts (1080x1350 PNG): real screens from the demo school in the layout of brand/social/post-template.html.
//   node scripts/social/posts-dec.mjs        → brand/social/out/posts/dec-*.png
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const api = path.join(root, "api");
const SHOTS = path.join(root, "brand/social/out/shots");
const OUT = path.join(root, "brand/social/out/posts");
const TEMPLATE = pathToFileURL(path.join(root, "brand/social/post-template.html")).href;
const BASE = "http://localhost:3000";
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
execFileSync(path.join(api, "venv/Scripts/python.exe"), ["../web/scripts/social/prep_reels.py", "enquiry", "admissions"],
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" }); // the enquiry reel's family off the list; a busy, up-to-date admissions desk

const browser = await chromium.launch();
const HIDE = "nextjs-portal{display:none!important} ::-webkit-scrollbar{display:none}";

async function as(who, { phone = true } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 430, height: 931 }, deviceScaleFactor: 3 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`${who}@demo.com`);
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|account/);
  return { ctx, page };
}
async function shot(who, url, name, opts) {
  const { ctx, page } = await as(who, opts);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  await ctx.close();
}

if (!process.argv.includes("--render")) {
  await shot("parent", "/my-timetable", "parent-timetable");
  await shot("admin", "/admissions", "admissions", { phone: false });
}

const POSTS = [
  { file: "dec-1-timetable", layout: "phone", shot: "parent-timetable", kicker: "FOR PARENTS", title: "Today's timetable, *period by period.*",
    sub: "Every lesson and teacher, on the parent's phone.", badge: "📚 Maths at 8:40 · *with Ms Verma*" },
  { file: "dec-2-admissions", layout: "browser", shot: "admissions", kicker: "ADMISSIONS 2027-28", title: "Admission season, *every enquiry tracked.*",
    sub: "Walk-ins, calls and website forms in one list, with follow-up dates, so no family is forgotten.", badge: "Every follow-up on time · *none overdue*" },
];
for (const p of POSTS) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } }); // fresh each time: the template reads its settings once
  const params = { ...p, img: pathToFileURL(path.join(SHOTS, `${p.shot}.png`)).href };
  await page.goto(`${TEMPLATE}#${encodeURIComponent(JSON.stringify(params))}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${p.file}.png`) });
  console.log(`${p.file}.png`);
  await page.close();
}
await browser.close();
