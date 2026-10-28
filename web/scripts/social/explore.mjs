// Prints what a demo person sees on a page at phone size (its accessibility outline), to write reel scripts against.
//   node scripts/social/explore.mjs teacher /attendance [width]
import { chromium } from "@playwright/test";

const [who = "teacher", path = "/dashboard", width = "390"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 844 } });
await page.goto("http://localhost:3000/login");
await page.waitForLoadState("networkidle");
await page.getByLabel("Email").fill(`${who}@demo.com`);
await page.getByRole("textbox", { name: "Password" }).fill("Demo@1234");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/dashboard|account/);
await page.goto(`http://localhost:3000/${path.replace(/^\/+/, "")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
// CLICK="button:Notifications" taps that control first (role:accessible name, a regex).
if (process.env.CLICK) {
  const [role, name] = process.env.CLICK.split(":");
  await page.getByRole(role, { name: new RegExp(name) }).first().click();
  await page.waitForTimeout(1000);
}
const outline = await page.locator(process.env.CLICK ? "body" : "#main").ariaSnapshot().catch(() => page.locator("body").ariaSnapshot());
console.log(outline.split("\n").slice(0, Number(process.env.LINES ?? 80)).join("\n"));
await page.screenshot({ path: process.env.SHOT ?? "C:/Users/Lenovo/AppData/Local/Temp/claude/d--personal-project-EDUVIA/6ffc2ef2-1eae-487b-917f-e0fc527bba9b/scratchpad/explore.png" });
await browser.close();
