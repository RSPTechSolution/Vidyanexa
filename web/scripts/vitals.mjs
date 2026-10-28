// Measures Core Web Vitals (CLS and LCP) on real page loads, with mobile-like CPU and network throttling.
// Usage: node scripts/vitals.mjs [--base http://127.0.0.1:3000] [--roles admin,teacher] [--public] [--mobile] [--fast] [--json out.json]
//   --public   the public website (from the sitemap) instead of the signed-in app
//   --mobile   a phone viewport (Pixel 7) instead of a 1440×900 desktop
//   --fast     no throttling
// For each page it prints CLS (the largest session window, as Google scores it), LCP and the LCP element,
// and the elements that moved, so a shift can be traced to its cause. (scripts/scripts-on-page.mjs lists a page's JavaScript.)
import { chromium, devices } from "@playwright/test";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(`--${name}`);
const BASE = opt("base", "http://127.0.0.1:3000");
const PASSWORD = "Demo@1234";
const ROLE_EMAILS = {
  admin: "admin@demo.com", principal: "principal@demo.com", teacher: "teacher@demo.com", accountant: "accounts@demo.com",
  receptionist: "reception@demo.com", librarian: "librarian@demo.com", hr: "hr@demo.com", transport: "transport@demo.com",
  security: "security@demo.com", staff: "staff@demo.com", driver: "driver@demo.com", parent: "parent@demo.com", student: "student@demo.com",
};
const roles = (opt("roles", "admin,teacher,parent")).split(",").map((r) => r.trim()).filter(Boolean);
const only = opt("pages", "")?.split(",").filter(Boolean) ?? [];

const OBSERVE = () => {
  const describe = (n) => {
    if (!n || n.nodeType !== 1) return n?.nodeName ?? "?";
    const cls = typeof n.className === "string" ? n.className.split(/\s+/).filter(Boolean).slice(0, 4).join(".") : "";
    const text = (n.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  window.__shifts = [];
  window.__lcp = null;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        t: Math.round(e.startTime), value: e.value,
        sources: (e.sources || []).map((s) => ({ node: describe(s.node), from: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), to: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    const e = list.getEntries().at(-1);
    window.__lcp = { t: Math.round(e.startTime), size: e.size, node: describe(e.element), url: e.url || "" };
  }).observe({ type: "largest-contentful-paint", buffered: true });
};

/** CLS as Google scores it: the largest burst of shifts (gaps under 1 s, windows at most 5 s). */
function cls(shifts) {
  let best = 0, cur = 0, start = 0, prev = -Infinity;
  for (const s of shifts) {
    if (s.t - prev > 1000 || s.t - start > 5000) { cur = 0; start = s.t; }
    cur += s.value; prev = s.t; best = Math.max(best, cur);
  }
  return best;
}

async function throttle(page) {
  if (flag("fast")) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

async function measure(context, url) {
  const page = await context.newPage();
  await page.addInitScript(OBSERVE);
  await throttle(page);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500); // late shifts: data, images, fonts
  // LCP stops at the first input, so read it before anything else happens.
  const data = await page.evaluate(() => ({
    shifts: window.__shifts, lcp: window.__lcp, path: location.pathname,
  }));
  await page.close();
  return { url, landed: data.path, ms: Date.now() - t0, cls: cls(data.shifts), lcp: data.lcp, shifts: data.shifts };
}

async function login(context, email) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  const button = page.getByRole("button", { name: "Sign in" });
  await button.waitFor();
  for (let i = 0; i < 20 && !(await button.isEnabled()); i++) await page.waitForTimeout(250);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Email").fill(email);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
    if ((await page.getByLabel("Email").inputValue()) === email) break;
  }
  await button.click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // On a phone the menu is behind a button.
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  if (await menuButton.isVisible()) await menuButton.click();
  const nav = page.getByRole("navigation", { name: "Main" }).last();
  await nav.waitFor();
  const hrefs = await nav.getByRole("link").evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""));
  await page.close();
  return [...new Set(hrefs.filter((h) => h.startsWith("/")))];
}

async function publicPages() {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).concat(["/login"]);
}

const fmt = (r) => {
  const flagCls = r.cls >= 0.1 ? "  ✗" : r.cls >= 0.02 ? "  ~" : "";
  const flagLcp = r.lcp && r.lcp.t >= 2500 ? "  ✗" : "";
  return `${r.url.padEnd(34)} CLS ${r.cls.toFixed(3)}${flagCls.padEnd(4)} LCP ${r.lcp ? `${r.lcp.t}ms`.padStart(7) : "     —"}${flagLcp.padEnd(4)}  ${r.lcp?.node ?? ""}`.slice(0, 200);
};

const browser = await chromium.launch();
const viewport = flag("mobile") ? devices["Pixel 7"] : { viewport: { width: 1440, height: 900 } };
const all = [];
const groups = flag("public") ? [["public", null]] : roles.map((r) => [r, ROLE_EMAILS[r] ?? r]);
for (const [name, email] of groups) {
  const context = await browser.newContext({ ...viewport, baseURL: BASE });
  let pages = email ? await login(context, email) : await publicPages();
  if (only.length) pages = pages.filter((p) => only.includes(p));
  console.log(`\n== ${name} (${pages.length} pages, ${flag("mobile") ? "mobile" : "desktop"}${flag("fast") ? "" : ", throttled"}) ==`);
  for (const p of pages) {
    const r = { role: name, ...(await measure(context, `${BASE}${p}`)), url: p };
    all.push(r);
    console.log(fmt(r));
    if (r.cls >= 0.02 && flag("why")) {
      for (const s of r.shifts.filter((s) => s.value >= 0.005)) {
        console.log(`    +${s.value.toFixed(3)} at ${s.t}ms`);
        for (const src of s.sources) console.log(`        ${src.node.slice(0, 110)}  ${src.from.join(",")} → ${src.to.join(",")}`);
      }
    }
  }
  await context.close();
}
await browser.close();
const bad = all.filter((r) => r.cls >= 0.1 || (r.lcp && r.lcp.t >= 2500));
console.log(`\n${all.length} pages · worst CLS ${Math.max(0, ...all.map((r) => r.cls)).toFixed(3)} · ${bad.length} over budget (CLS ≥ 0.1 or LCP ≥ 2.5 s)`);
const out = opt("json");
if (out) writeFileSync(out, JSON.stringify(all, null, 2));
