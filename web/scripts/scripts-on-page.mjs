// Lists the JavaScript a signed-in page downloads, biggest first, and when each one started.
// Usage: node scripts/scripts-on-page.mjs /homework [email]
import { chromium } from "@playwright/test";

const [path = "/dashboard", email = "admin@demo.com"] = process.argv.slice(2);
const BASE = "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ baseURL: BASE });
await page.goto("/login");
const button = page.getByRole("button", { name: "Sign in" });
for (let i = 0; i < 20 && !(await button.isEnabled()); i++) await page.waitForTimeout(250);
await page.getByLabel("Email").fill(email);
await page.getByRole("textbox", { name: "Password", exact: true }).fill("Demo@1234");
await button.click();
await page.waitForURL(/dashboard/);
const fresh = await browser.newPage({ storageState: await page.context().storageState(), baseURL: BASE });
await fresh.goto(path, { waitUntil: "networkidle" });
await fresh.waitForTimeout(2000);
const rows = await fresh.evaluate(() =>
  performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).map((r) => ({ name: r.name.split("/_next/")[1] ?? r.name, kb: Math.round(r.encodedBodySize / 1024), start: Math.round(r.startTime), by: r.initiatorType })),
);
rows.sort((a, b) => b.kb - a.kb);
let total = 0;
for (const r of rows) { total += r.kb; console.log(`${String(r.kb).padStart(5)} kB  @${String(r.start).padStart(5)}ms  ${r.by.padEnd(6)} ${r.name}`); }
console.log(`${rows.length} scripts, ${total} kB`);
await browser.close();
