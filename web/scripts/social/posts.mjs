// Instagram feed posts (1080x1350 PNG): real screens from the demo school, in the brand layout of
// brand/social/post-template.html. Captures the screens, then renders each post.
//   node scripts/social/posts.mjs        → brand/social/out/posts/*.png
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
const py = (script) => execFileSync(path.join(api, "venv/Scripts/python.exe"), [`../web/scripts/social/${script}`],
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" });

const browser = await chromium.launch();
const HIDE = "nextjs-portal{display:none!important} ::-webkit-scrollbar{display:none} #main p.mt-2.text-center.text-xs{visibility:hidden}";

async function as(who, { phone = true } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 430, height: 931 }, deviceScaleFactor: 3 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("School ID").fill("demo");
  await page.getByLabel("Email").fill(`${who}@demo.com`);
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|account/);
  return { ctx, page };
}
async function shot(page, name) {
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const renderOnly = process.argv.includes("--render");
// 1. Teacher: the register, everyone marked and saved.
if (!renderOnly) py("reset_today.py");
if (!renderOnly) {
  const { ctx, page } = await as("teacher");
  await page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Class 5 – A/ }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("radiogroup", { name: "Attendance for Shaurya Kapoor" }).getByRole("radio", { name: "Late" }).click();
  await page.getByRole("button", { name: "Mark rest present" }).click();
  await page.waitForTimeout(400);
  await shot(page, "register");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await page.waitForTimeout(1500);
  await ctx.close();
}
// 2. Parent: the absence alert. (His fees paid and old alerts cleared, then Aarav marked absent by his teacher.)
if (!renderOnly) { py("prep_parent.py"); py("reset_today.py"); }
if (!renderOnly) {
  const t = await as("teacher");
  await t.page.goto(`${BASE}/attendance`, { waitUntil: "networkidle" });
  await t.page.getByRole("link", { name: /Class 5 – A/ }).click();
  await t.page.waitForLoadState("networkidle");
  await t.page.getByRole("radiogroup", { name: "Attendance for Aarav Patel" }).getByRole("radio", { name: "Absent" }).click();
  await t.page.getByRole("textbox", { name: "Reason for Aarav Patel" }).fill("Fever");
  await t.page.getByRole("button", { name: "Mark rest present" }).click();
  await t.page.getByRole("button", { name: "Save attendance" }).click();
  await t.page.waitForTimeout(1500);
  await t.ctx.close();
  const { ctx, page } = await as("parent");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, "parent-alert.png") });
  // 3. Parent: fees.
  await page.goto(`${BASE}/my-fees`, { waitUntil: "networkidle" });
  await shot(page, "parent-fees");
  await ctx.close();
}
// 4. Principal: the dashboard on a real school day (desktop).
if (!renderOnly) py("fill_today.py");
if (!renderOnly) {
  const { ctx, page } = await as("admin", { phone: false });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "dashboard");
  await ctx.close();
}
// 5. The AI assistant answering.
if (!renderOnly) {
  const { ctx, page } = await as("admin");
  await page.goto(`${BASE}/assistant`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Your question" }).fill("Which students are below 75% attendance?");
  await page.getByRole("button", { name: "Ask" }).click();
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => document.scrollingElement.scrollTo(0, 120));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, "assistant.png") });
  await ctx.close();
}

// ---- the posts ----
const POSTS = [
  { file: "1-teachers-attendance", layout: "phone", shot: "register", kicker: "FOR TEACHERS", title: "Attendance in *10 seconds.*",
    sub: "Tap the few who are absent or late. Everyone else: one tap. Saved, and parents are told.", badge: "✓ Class 5 – A · all marked · *saved*" },
  { file: "2-parents-alert", layout: "phone", shot: "parent-alert", kicker: "FOR PARENTS", title: "Know *the moment* your child is absent.",
    sub: "Attendance, homework, fees and notices from school, on your phone.", badge: "🔔 Aarav marked absent · *just now*" },
  { file: "3-fees", layout: "phone", shot: "parent-fees", kicker: "FEES", title: "Fees and receipts, *sorted.*",
    sub: "Parents see what's due and get a receipt the moment it's paid, by UPI, cash or cheque.", badge: "✓ Paid by UPI · *receipt on the phone*" },
  { file: "4-principals-dashboard", layout: "browser", shot: "dashboard", kicker: "FOR PRINCIPALS", title: "Your whole school, *one screen.*",
    sub: "Attendance, fees, staff and notices, live. Know how today is going before the first bell rings.", badge: "97% present today · *27 / 27 classes marked*" },
  { file: "5-ai-assistant", layout: "phone", shot: "assistant", kicker: "AI ASSISTANT", title: "Ask your school *anything.*",
    sub: "Who's below 75%? Who hasn't paid? Ask in plain words, get the answer from your own records.", badge: "“Which students are below 75%?” · *answered*" },
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
