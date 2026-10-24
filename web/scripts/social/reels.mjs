// Instagram Reels (1080x1920 MP4) recorded from the real app with the demo school, in the brand frame of
// brand/social/reel-template.html: headline on top, the app in a phone, captions as things happen, a closing card.
//
//   node scripts/social/reels.mjs                 every storyboard
//   node scripts/social/reels.mjs attendance      one module
//   node scripts/social/reels.mjs attendance 2    one reel
//
// Needs the local app (web on :3000, API on :8000) with a fresh demo school, and ffmpeg on PATH. Writes to
// brand/social/out/reels/<module>-<n>-<slug>.mp4. Storyboards live in ./stories/*.mjs.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const OUT = path.join(root, "brand/social/out/reels");
const WORK = path.join(root, "brand/social/out/.work");
const TEMPLATE = pathToFileURL(path.join(root, "brand/social/reel-template.html")).href;
const BASE = "http://localhost:3000";
const PHONE = { width: 430, height: 931 }; // a large phone; same shape as the screen in the frame (560 x 1212)
const FPS = 30;
const END_CARD = 2.8; // seconds
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

// ---- the people ----------------------------------------------------------------------------------------------
const states = new Map();
async function signedIn(browser, who) {
  if (states.has(who)) return states.get(who);
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("School ID").fill("demo");
  await page.getByLabel("Email").fill(`${who}@demo.com`);
  await page.getByRole("textbox", { name: "Password" }).fill("Demo@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|account/);
  const state = await ctx.storageState();
  await ctx.close();
  states.set(who, state);
  return state;
}

// Shows each tap as a soft circle (screen recordings don't show touches), and hides anything that isn't the app.
const TOUCHES = `
  addEventListener("pointerdown", (e) => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:46px;height:46px;border-radius:50%;" +
      "left:" + (e.clientX - 23) + "px;top:" + (e.clientY - 23) + "px;background:rgba(184,137,60,.35);border:3px solid rgba(184,137,60,.9);" +
      "transform:scale(.6);opacity:1;transition:transform .45s ease-out, opacity .6s ease-out";
    document.documentElement.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = "scale(1.4)"; d.style.opacity = "0"; });
    setTimeout(() => d.remove(), 700);
  }, true);
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important} ::-webkit-scrollbar{display:none}";
  document.documentElement.appendChild(s);
`;

/** Helpers each storyboard step gets: a paced page and a caption marker. */
function director(page, t0, captions) {
  const pause = (ms = 900) => page.waitForTimeout(ms);
  return {
    page,
    pause,
    /** Show a caption from now until the next one (or the end). */
    caption(text) {
      const t = (Date.now() - t0) / 1000;
      if (captions.length && captions.at(-1).end == null) captions.at(-1).end = t;
      captions.push({ text, start: t, end: null });
    },
    noCaption() {
      const last = captions.at(-1);
      if (last && last.end == null) last.end = (Date.now() - t0) / 1000;
    },
    async tap(locator, wait = 700) {
      await locator.scrollIntoViewIfNeeded();
      await pause(250);
      await locator.click();
      await pause(wait);
    },
    async type(locator, text, wait = 500) {
      await locator.click();
      await page.keyboard.type(text, { delay: 75 });
      await pause(wait);
    },
    /** Scroll smoothly by `dy` pixels, as a thumb would. */
    async scroll(dy, ms = 900) {
      await page.evaluate(([dy, ms]) => new Promise((done) => {
        const el = document.scrollingElement, from = el.scrollTop, start = performance.now();
        const step = (now) => { const k = Math.min(1, (now - start) / ms); el.scrollTop = from + dy * (1 - Math.cos(k * Math.PI)) / 2; k < 1 ? requestAnimationFrame(step) : done(); };
        requestAnimationFrame(step);
      }), [dy, ms]);
      await pause(300);
    },
  };
}

/** Records one segment: `who` signed in, starting at `url`, then `run(d)`. Returns the video file and where it starts. */
async function record(browser, seg, timeline) {
  const ctx = await browser.newContext({
    // Recordings are captured at the viewport's size (not its pixel density), so record 1:1 and scale in the edit.
    viewport: PHONE, storageState: await signedIn(browser, seg.as),
    recordVideo: { dir: WORK, size: PHONE },
  });
  await ctx.addInitScript(TOUCHES);
  const page = await ctx.newPage();
  const tVideo = Date.now();
  await page.goto(`${BASE}${seg.url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(seg.settle ?? 900);
  const tStart = Date.now();
  const captions = [];
  const d = director(page, tStart, captions);
  await seg.run(d);
  d.noCaption();
  await page.waitForTimeout(seg.hold ?? 1200);
  const length = (Date.now() - tStart) / 1000;
  await ctx.close();
  const file = await page.video().path();
  timeline.push({ file, skip: (tStart - tVideo) / 1000, length, captions });
}

// ---- the edit ------------------------------------------------------------------------------------------------
async function layer(browser, name, params) {
  const file = path.join(WORK, `${name}.png`);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`${TEMPLATE}#${encodeURIComponent(JSON.stringify(params))}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: params.layer !== "bg" && params.layer !== "end" });
  await page.close();
  return file;
}

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

async function compose(browser, story, timeline, outFile) {
  const id = path.basename(outFile, ".mp4");
  const bg = await layer(browser, `${id}-bg`, { layer: "bg", kicker: story.kicker, title: story.title });
  const frame = await layer(browser, `frame`, { layer: "frame" });
  const end = await layer(browser, `${id}-end`, { layer: "end", line: story.endLine });

  // 1. The recording: each segment trimmed to its action, joined, at 30 fps.
  const joined = path.join(WORK, `${id}-screen.mp4`);
  const inputs = timeline.flatMap((s) => ["-ss", s.skip.toFixed(2), "-t", s.length.toFixed(2), "-i", s.file]);
  const chain = timeline.map((_, i) => `[${i}:v]fps=${FPS},scale=560:1212:flags=lanczos,setsar=1[s${i}]`).join(";");
  const concat = `${timeline.map((_, i) => `[s${i}]`).join("")}concat=n=${timeline.length}:v=1:a=0[v]`;
  ffmpeg([...inputs, "-filter_complex", `${chain};${concat}`, "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", joined]);

  // 2. Captions on one timeline (segments follow each other).
  let offset = 0;
  const caps = [];
  for (const s of timeline) {
    for (const c of s.captions) caps.push({ text: c.text, start: offset + c.start, end: offset + (c.end ?? s.length) });
    offset += s.length;
  }
  const total = offset + END_CARD;
  const capFiles = [];
  for (const [i, c] of caps.entries()) capFiles.push(await layer(browser, `${id}-cap${i}`, { layer: "caption", caption: c.text }));

  // 3. Stack: background, the screen in the phone, the bezel, captions fading in and out, then the closing card.
  const args = ["-loop", "1", "-t", total.toFixed(2), "-i", bg, "-i", joined, "-loop", "1", "-t", total.toFixed(2), "-i", frame];
  capFiles.forEach((f) => args.push("-loop", "1", "-t", total.toFixed(2), "-i", f));
  args.push("-loop", "1", "-t", total.toFixed(2), "-i", end);
  args.push("-f", "lavfi", "-t", total.toFixed(2), "-i", "anullsrc=r=48000:cl=stereo"); // silent track: Instagram wants one
  const n = 3 + capFiles.length; // index of the end card
  let g = `[1:v]tpad=stop_mode=clone:stop_duration=${END_CARD + 1}[scr];[0:v][scr]overlay=260:500:shortest=0[a0];[a0][2:v]overlay=0:0[b0]`;
  let last = "b0";
  caps.forEach((c, i) => {
    const a = Math.max(0, c.start), b = Math.max(a + 0.6, c.end);
    g += `;[${3 + i}:v]format=rgba,fade=t=in:st=${a.toFixed(2)}:d=0.25:alpha=1,fade=t=out:st=${(b - 0.25).toFixed(2)}:d=0.25:alpha=1[c${i}]`;
    g += `;[${last}][c${i}]overlay=0:0:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'[k${i}]`;
    last = `k${i}`;
  });
  const e0 = (total - END_CARD).toFixed(2);
  g += `;[${n}:v]format=rgba,fade=t=in:st=${e0}:d=0.45:alpha=1[end];[${last}][end]overlay=0:0:enable='gte(t,${e0})'[out]`;
  ffmpeg([...args, "-filter_complex", g, "-map", "[out]", "-map", `${n + 1}:a`, "-t", total.toFixed(2), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outFile]);
  return total;
}

// ---- run -----------------------------------------------------------------------------------------------------
const [onlyModule, onlyIndex] = process.argv.slice(2);
const modules = fs.readdirSync(path.join(here, "stories")).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
const browser = await chromium.launch();
for (const mod of modules.filter((m) => !onlyModule || m === onlyModule)) {
  const { default: stories, before } = await import(pathToFileURL(path.join(here, "stories", `${mod}.mjs`)).href);
  for (const [i, story] of stories.entries()) {
    if (onlyIndex && Number(onlyIndex) !== i + 1) continue;
    const outFile = path.join(OUT, `${mod}-${i + 1}-${story.slug}.mp4`);
    process.stdout.write(`${path.basename(outFile)} … `);
    if (story.before) story.before(); else if (before) before(story); // the data each reel starts from
    const timeline = [];
    for (const seg of story.segments) await record(browser, seg, timeline);
    const secs = await compose(browser, story, timeline, outFile);
    console.log(`${secs.toFixed(1)}s`);
  }
}
await browser.close();
