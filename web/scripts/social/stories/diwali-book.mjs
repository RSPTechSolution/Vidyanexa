// Diwali reel in the picture-book look of the Children's Day reel (theme: "diwalibook"): marigolds, lanterns, diyas and
// the same hand-drawn children. The app moment is the one from nov-1-diwali-notice (the AI assistant writes the Diwali
// holidays notice, and it reaches every parent):
//   node scripts/social/reels.mjs diwali-book      → brand/social/out/reels/diwali-book-1-holidays-notice.mp4
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../api");
const prep = (...steps) => execFileSync(path.join(api, "venv/Scripts/python.exe"), ["../web/scripts/social/prep_reels.py", ...steps],
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" });

// The API as a demo person, for what happens off camera (the principal posting the drafted notice).
const API = "http://localhost:8000/api/v1";
async function as(email) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Demo@1234", school_slug: "demo" }) });
  const token = (await r.json()).data.tokens.access_token;
  return async (method, p, body) => {
    const res = await fetch(`${API}${p}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined });
    const j = await res.json();
    if (!res.ok) throw new Error(`${method} ${p}: ${JSON.stringify(j.error)}`);
    return j.data;
  };
}

export default [
  {
    slug: "holidays-notice", theme: "diwalibook", kicker: "SHUBH DEEPAVALI · 8 NOVEMBER", title: "Diwali notice? *Ready in seconds* 🪔",
    endLine: "Wishing every school and family a bright Diwali",
    before: () => prep("notices", "requests"),
    segments: [
      {
        as: "principal", url: "/assistant", settle: 1000,
        run: async (d) => {
          await d.page.addStyleTag({ content: "#main p.mt-2.text-center.text-xs { visibility: hidden }" });
          d.caption("Diwali's coming. *Ask for the notice.*");
          await d.type(d.page.getByRole("textbox", { name: "Your question" }), "Write a notice about Diwali holidays from 7 to 10 November", 300);
          await d.tap(d.page.getByRole("button", { name: "Ask" }), 1500);
          d.caption("A ready draft, *in seconds*");
          await d.scroll(260, 1000);
          await d.pause(1600);
          // Posted from the draft, as the principal would from Notices.
          const draft = (await d.page.locator("p.whitespace-pre-line").last().textContent()) ?? "";
          const call = await as("principal@demo.com");
          await call("POST", "/notices", { title: "Diwali holidays", body: draft.trim(), audience: "everyone", priority: "important" });
        },
      },
      {
        as: "parent", url: "/notices", settle: 1100,
        run: async (d) => {
          d.caption("Posted, and on *every parent's phone*");
          await d.pause(900);
          await d.tap(d.page.getByRole("button", { name: /Diwali holidays/ }).first(), 1600);
          d.caption("Happy Diwali from *Green Valley* 🪔");
          await d.pause(1800);
        },
      },
    ],
  },
];
