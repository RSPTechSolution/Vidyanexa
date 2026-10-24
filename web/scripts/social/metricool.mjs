// Turns brand/social/feed.md into a Metricool bulk-scheduling CSV (Planning → Import CSV), and puts the media where
// Metricool can fetch it: web/public/social/, served at https://www.vidyanexa.com/social/ once the site is deployed.
//
//   node scripts/social/metricool.mjs                        → brand/social/metricool.csv
//   node scripts/social/metricool.mjs --start 2026-10-26     first post date (then Mon/Wed/Fri)
//   node scripts/social/metricool.mjs --template path.csv    fill the template downloaded from Metricool instead,
//                                                            keeping its exact header row (safest if Metricool renames columns)
//
// Metricool needs: UTF-8, comma-separated, TRUE/FALSE in the network and Draft columns, "Instagram Post Type" of
// POST or REEL, and public links to the files. Times are in the brand's timezone (set Asia/Kolkata in Metricool).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const FEED = path.join(root, "brand/social/feed.md");
const MEDIA_SRC = path.join(root, "brand/social/out");
const PUBLIC_DIR = path.join(root, "web/public/social");
const PUBLIC_URL = "https://www.vidyanexa.com/social";
const OUT = path.join(root, "brand/social/metricool.csv");
const TIME = "19:30:00"; // 7:30 pm: after school hours, when principals and owners are on their phones
const COVER_AT = "3.0"; // seconds into each Reel: headline, phone and first caption all showing

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const start = new Date(`${opt("--start") ?? "2026-10-26"}T00:00:00`);

// ---- the feed: "## N · Image|Reel · `posts/file.png`", then a ``` caption block, then "**Alt text:** …" ----
const md = fs.readFileSync(FEED, "utf8");
const posts = [...md.matchAll(/^## (\d+) · (Image|Reel) · `([^`]+)`\s*\n+```\n([\s\S]*?)\n```[\s\S]*?\*\*Alt text:\*\* (.+)$/gm)]
  .map(([, n, kind, file, caption, alt]) => ({ n: Number(n), kind, file, caption: caption.trim(), alt: alt.trim() }));
if (posts.length === 0) throw new Error("No posts found in feed.md");

// ---- dates: Monday, Wednesday, Friday ----
function nextSlot(d) {
  const x = new Date(d);
  while (![1, 3, 5].includes(x.getDay())) x.setDate(x.getDate() + 1);
  return x;
}
let day = nextSlot(start);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---- media: copy to the public folder, with a cover image for each Reel ----
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
for (const p of posts) {
  const src = path.join(MEDIA_SRC, p.file);
  if (!fs.existsSync(src)) throw new Error(`Missing ${src}: run posts.mjs / reels.mjs first`);
  p.public = `${String(p.n).padStart(2, "0")}-${path.basename(p.file)}`;
  if (p.kind === "Reel") {
    // Instagram's publishing API can refuse a video with no audio track: add a silent one (AAC 128 kbps, its limit).
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", path.join(PUBLIC_DIR, p.public)]);
  } else {
    fs.copyFileSync(src, path.join(PUBLIC_DIR, p.public));
  }
  if (p.kind === "Reel") {
    p.cover = p.public.replace(/\.mp4$/, "-cover.jpg");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", COVER_AT, "-i", src, "-frames:v", "1", "-q:v", "2", path.join(PUBLIC_DIR, p.cover)]);
  }
  p.date = ymd(day);
  day.setDate(day.getDate() + 1);
  day = nextSlot(day);
}

// ---- columns (Metricool's template order; "don't delete or add columns") ----
const range = (name, n) => Array.from({ length: n }, (_, i) => `${name} ${i + 1}`);
const DEFAULT_HEADERS = [
  "Text", "Date", "Time", "Draft", "Facebook", "Twitter", "LinkedIn", "GMB", "Instagram", "Pinterest", "TikTok", "Youtube", "Threads", "Bluesky",
  ...range("Picture Url", 10), ...range("Alt text picture", 10), "Document title", "Shortener", "Video Thumbnail Url", "Video Cover Frame",
  "Twitter Can reply", "Twitter Type", "Twitter Poll Duration minutes", ...range("Twitter Poll Option", 4),
  "Pinterest Board", "Pinterest Pin Title", "Pinterest Pin Link", "Pinterest Pin New Format",
  "Instagram Post Type", "Instagram Show Reel On Feed",
  "Youtube Video Title", "Youtube Video Type", "Youtube Video Privacy", "Youtube video for kids", "Youtube Video Category", "Youtube Video Tags",
  "Youtube Playlist", "Youtube Notify Subscribers", "GMB Post Type", "Facebook Post Type", "Facebook Title", "First Comment Text",
  "Tiktok Title", "Tiktok disable comments", "Tiktok disable duet", "Tiktok disable stitch", "Tiktok Post Privacy", "Tiktok Branded Content",
  "Tiktok Your Brand", "Tiktok Auto Add Music", "Tiktok Photo Cover Index",
  "LinkedIn Type", "LinkedIn Poll Question", ...range("LinkedIn Poll Option", 4), "LinkedIn Poll Duration", "LinkedIn Show link preview",
  "LinkedIn Images as Carousel", "Threads Reply Control", "Threads Is Spoiler", "Threads Post Type", "Brand name",
];

// CSV parsing just enough to read a downloaded template's header row.
function headerRow(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const out = []; let cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { out.push(cell); return out.filter((h, i2) => h || i2 < out.length - 1); }
    else cell += c;
  }
  out.push(cell);
  return out;
}
const headers = opt("--template") ? headerRow(opt("--template")) : DEFAULT_HEADERS;

// Values by meaning; matched to the header names loosely (case, "(up to 10)", "Twitter/X" and the like don't matter).
const norm = (h) => h.toLowerCase().replace(/\(.*?\)/g, "").replace(/twitter\/x/g, "twitter").replace(/[^a-z0-9]/g, "");
const NETWORKS = ["facebook", "twitter", "linkedin", "gmb", "gbp", "instagram", "pinterest", "tiktok", "youtube", "threads", "bluesky"];
function row(p) {
  const v = {
    text: p.caption, date: p.date, time: TIME, draft: "FALSE",
    pictureurl1: `${PUBLIC_URL}/${p.public}`, alttextpicture1: p.alt,
    instagramposttype: p.kind === "Reel" ? "REEL" : "POST",
    instagramshowreelonfeed: p.kind === "Reel" ? "TRUE" : "",
    videothumbnailurl: p.cover ? `${PUBLIC_URL}/${p.cover}` : "",
  };
  return headers.map((h) => {
    const k = norm(h);
    if (NETWORKS.includes(k)) return k === "instagram" ? "TRUE" : "FALSE";
    return v[k] ?? "";
  });
}
const cell = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = [headers, ...posts.map(row)].map((r) => r.map((x) => cell(String(x))).join(",")).join("\r\n") + "\r\n";
fs.writeFileSync(OUT, "﻿" + csv, "utf8"); // BOM: Excel and Metricool both read it as UTF-8 (emojis, ₹)

for (const p of posts) console.log(`${p.date} ${TIME.slice(0, 5)}  ${p.kind.padEnd(5)}  ${PUBLIC_URL}/${p.public}${p.cover ? `  (cover ${p.cover})` : ""}`);
console.log(`\n${posts.length} posts → ${path.relative(root, OUT)}${opt("--template") ? " (headers from your template)" : ""}`);
