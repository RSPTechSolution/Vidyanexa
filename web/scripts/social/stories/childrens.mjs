// Children's Day reel (14 November), in the picture-book look of the Children's Day posts (theme: "childrens").
// The same moment as nov-2-childrens-day (a parent opening the school's Children's Day message), dressed for the day:
//   node scripts/social/reels.mjs childrens      → brand/social/out/reels/childrens-1-happy-childrens-day.mp4
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../api");
const prep = (...steps) => execFileSync(path.join(api, "venv/Scripts/python.exe"), ["../web/scripts/social/prep_reels.py", ...steps],
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" });

// The API as a demo person, for what happens off camera (the principal posting the notice).
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
    slug: "happy-childrens-day", theme: "childrens", kicker: "14 NOVEMBER · BAL DIWAS", title: "Happy *Children's Day* 🎈",
    endLine: "Bringing schools and families closer, every day",
    before: async () => {
      prep("notices", "requests");
      const call = await as("principal@demo.com");
      await call("POST", "/notices", { title: "Happy Children's Day", audience: "everyone", priority: "normal",
        body: "Dear Parents,\n\nToday we celebrate every child at Green Valley: their curiosity, kindness and big dreams. " +
              "Thank you for sharing them with us.\n\nSpecial assembly at 9 am, and a little treat for every class!\n\nWith warm wishes,\nDr. Rajesh Kumar, Principal" });
    },
    segments: [{
      as: "parent", url: "/dashboard", settle: 1200,
      run: async (d) => {
        d.caption("A message from school 🎈");
        await d.tap(d.page.getByRole("button", { name: /^Notifications/ }), 1500);
        await d.page.keyboard.press("Escape");
        await d.page.goto("http://localhost:3000/notices", { waitUntil: "networkidle" });
        await d.pause(500);
        d.caption("Straight to every *parent's phone*");
        await d.tap(d.page.getByRole("button", { name: /Happy Children's Day/ }).first(), 1500);
        d.caption("Every child, *celebrated* 💛");
        await d.scroll(200, 900);
        await d.pause(2000);
      },
    }],
  },
];
