// Re-captures the screenshots on the public home page from the running demo (seeded with `python -m app.seed`).
//   web on :3000, API on :8000, Flutter parent web build served on :8090 (optional)
//   node scripts/marketing-screenshots.mjs
import { chromium } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const FLUTTER = process.env.FLUTTER_URL ?? "http://localhost:8090";
const OUT = new URL("../public/marketing/", import.meta.url);

async function dashboard(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`);
  await page.getByRole("button", { name: "Sign in" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("button[type=submit]")?.hasAttribute("disabled"));
  await page.getByLabel("Email").fill("admin@demo.com");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Demo@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500); // charts animate in
  await page.screenshot({ path: new URL(`dashboard-${theme}.png`, OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  await ctx.close();
  console.log(`dashboard-${theme}.png`);
}

async function parentApp(browser) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  const page = await ctx.newPage();
  try {
    await page.goto(FLUTTER, { timeout: 10_000 });
  } catch {
    console.log("Flutter web build not served; skipping app-parent.png");
    return ctx.close();
  }
  await page.waitForSelector("flt-glass-pane, flutter-view", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector("flt-semantics-placeholder")?.click());
  await page.waitForTimeout(800);
  for (const [name, value] of [[/Email/, "parent@demo.com"], [/Password/, "Demo@1234"]]) {
    await page.getByRole("textbox", { name }).click();
    await page.waitForTimeout(250);
    await page.keyboard.type(value, { delay: 15 });
  }
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText(/Suresh/).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: new URL("app-parent.png", OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  await ctx.close();
  console.log("app-parent.png");
}

const browser = await chromium.launch();
await dashboard(browser, "light");
await dashboard(browser, "dark");
await parentApp(browser);
await browser.close();
