// The November–December reels, in posting order. Each prepares the demo school it starts from (prep_reels.py), so any
// reel can be re-recorded on its own: node scripts/social/reels.mjs nov <n>
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../api");
const py = (...args) => execFileSync(path.join(api, "venv/Scripts/python.exe"), args,
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" });
const prep = (...steps) => py("../web/scripts/social/prep_reels.py", ...steps);

// The API as a demo person, for what happens off camera (the driver's GPS, a notice being posted).
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
// Ask an open page to refresh its data now (as when the app comes back to the screen).
const refresh = (page) => page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });

const share = {}; // values passed from one scene to the next (the gate pass code, the bus trip)

export default [
  // 1 · Thu 5 Nov
  {
    slug: "diwali-notice", kicker: "AI ASSISTANT", title: "Diwali notice to every parent, *written for you.*",
    endLine: "Notices, circulars and messages to every parent's phone",
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
  // 2 · Sat 14 Nov
  {
    slug: "childrens-day", kicker: "CHILDREN'S DAY", title: "Happy *Children's Day* 🎈",
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
        await d.tap(d.page.getByRole("button", { name: /Happy Children's Day/ }).first(), 1500);
        d.caption("Every child, *celebrated*");
        await d.scroll(200, 900);
        await d.pause(1800);
      },
    }],
  },
  // 3 · Wed 18 Nov
  {
    slug: "fee-day", kicker: "FEES", title: "Fee day *without the queue.*",
    endLine: "Fees, receipts and reminders, sorted",
    before: () => prep("fees"),
    segments: [
      {
        as: "accounts", url: "/fees?tab=invoices&q=Vihaan", settle: 1200,
        run: async (d) => {
          d.caption("Find the student");
          await d.tap(d.page.getByRole("link", { name: /Vihaan Thakur/ }).first(), 1300);
          d.caption("Paid by UPI? *Two taps.*");
          await d.tap(d.page.getByRole("button", { name: "Collect payment" }), 900);
          await d.tap(d.page.getByRole("dialog").getByRole("button", { name: "UPI" }), 600);
          await d.tap(d.page.getByRole("button", { name: /^Record ₹/ }), 2000);
          d.caption("Receipt made. *Done.*");
          await d.pause(1500);
        },
      },
      {
        as: "amit.thakur2", url: "/dashboard", settle: 1200,
        run: async (d) => {
          d.caption("And on Vihaan's father's phone");
          await d.tap(d.page.getByRole("button", { name: /^Notifications/ }), 2000);
          d.caption("Fee received: *₹10,000* ✓");
          await d.pause(2000);
        },
      },
    ],
  },
  // 4 · Fri 20 Nov
  {
    slug: "school-bus", kicker: "TRANSPORT", title: "Where's the school bus *right now?*",
    endLine: "Live bus tracking, and an alert when your child gets on",
    before: async () => {
      prep("bus", "requests");
      const driver = await as("driver@demo.com");
      const today = await driver("GET", "/transport/driver/today");
      const route = today.routes[0];
      const trip = await driver("POST", "/transport/trips", { route_id: route.id, direction: "pickup" });
      // A path through the route's stops, in small steps.
      const stops = route.stops.slice().sort((a, b) => a.sort_order - b.sort_order);
      const path = [];
      for (let i = 0; i < stops.length - 1; i++) {
        for (let k = 0; k < 6; k++) path.push([stops[i].lat + (stops[i + 1].lat - stops[i].lat) * k / 6, stops[i].lng + (stops[i + 1].lng - stops[i].lng) * k / 6]);
      }
      await driver("POST", `/transport/trips/${trip.id}/ping`, { lat: path[0][0], lng: path[0][1], speed: 28 });
      const aarav = trip.roster.find((r) => r.name.startsWith("Aarav"));
      Object.assign(share, { driver, trip, path, aarav, stops });
    },
    segments: [{
      as: "parent", url: "/my-transport", settle: 1500,
      run: async (d) => {
        const { driver, trip, path, aarav } = share;
        d.caption("The morning bus is *on its way*");
        for (let i = 1; i < Math.min(path.length, 12); i++) {
          await driver("POST", `/transport/trips/${trip.id}/ping`, { lat: path[i][0], lng: path[i][1], speed: 26 + (i % 3) * 4 });
          await refresh(d.page);
          await d.pause(650);
          if (i === 5) d.caption("Live on the map, *every few seconds*");
        }
        await driver("POST", `/transport/trips/${trip.id}/board`, { student_id: aarav.student_id, event: "boarded" });
        await refresh(d.page);
        await d.page.getByText("Got on the bus").first().waitFor({ timeout: 15000 });
        d.caption("Aarav got on the bus ✓ *Parents told at once*");
        await d.scroll(320, 1000);
        await d.pause(1800);
      },
    }],
  },
  // 5 · Mon 23 Nov
  {
    slug: "principal-745", kicker: "FOR PRINCIPALS", title: "POV: it's *7:45 am* and you already know.",
    endLine: "Your whole school, one screen",
    before: () => py("../web/scripts/social/fill_today.py"),
    segments: [{
      as: "admin", url: "/dashboard", settle: 1300, clock: "07:45",
      run: async (d) => {
        d.caption("Before the first bell rings…");
        await d.pause(1700);
        d.caption("Who's in, who's absent: *live*");
        await d.scroll(330, 1300);
        await d.pause(1200);
        d.caption("Fees collected, staff on leave, notices");
        await d.scroll(520, 1500);
        await d.pause(1200);
        d.caption("Your whole school, *one screen*");
        await d.scroll(520, 1500);
        await d.pause(1500);
      },
    }],
  },
  // 6 · Wed 25 Nov
  {
    slug: "homework-done", kicker: "HOMEWORK", title: "Homework, *done* ✅",
    endLine: "Homework, attendance and fees on every parent's phone",
    before: () => prep("homework"),
    segments: [
      {
        as: "teacher", url: "/homework", settle: 1000,
        run: async (d) => {
          d.caption("Teacher sets tonight's homework");
          await d.tap(d.page.getByRole("button", { name: "Set homework" }), 900);
          const dialog = d.page.getByRole("dialog");
          await d.tap(dialog.getByRole("combobox", { name: "Class" }), 500);
          await d.tap(d.page.getByRole("option", { name: /Class 5 – A/ }), 600);
          await d.type(dialog.getByRole("textbox", { name: "Task" }), "Fractions practice: Exercise 6.1", 400);
          await d.tap(dialog.getByRole("button", { name: "Set homework" }), 1500);
        },
      },
      {
        as: "parent", url: "/my-homework", settle: 1200,
        run: async (d) => {
          d.caption("It's on the parent's phone, *right away*");
          await d.pause(1500);
          const item = d.page.getByRole("listitem").filter({ hasText: "Fractions practice" }).first();
          d.caption("Done at home? *One tap* ✅");
          await d.tap(item.getByRole("button", { name: "Mark as done" }), 1600);
          d.caption("The teacher sees it *instantly*");
          await d.pause(1800);
        },
      },
    ],
  },
  // 7 · Fri 27 Nov
  {
    slug: "gate-pass", kicker: "SAFETY", title: "No gate pass, *no exit.*",
    endLine: "Gate passes, visitors and campus safety",
    before: () => prep("requests"),
    segments: [
      {
        as: "parent", url: "/gate-pass", settle: 1000,
        run: async (d) => {
          d.caption("Early pickup? Ask from your phone");
          await d.tap(d.page.getByRole("button", { name: "Early pickup" }), 900);
          const dialog = d.page.getByRole("dialog");
          await d.tap(dialog.getByRole("combobox", { name: "Child" }), 400);
          await d.tap(d.page.getByRole("option", { name: /Aarav/ }), 400);
          // Shown as 1:30 pm today; sent as a time the server accepts now, and set back to 1:30 pm by prep("passtime").
          await d.page.route("**/gate/passes", (route) => {
            const body = JSON.parse(route.request().postData() ?? "{}");
            route.continue({ postData: JSON.stringify({ ...body, leave_at: new Date(Date.now() + 5 * 60_000).toISOString() }) });
          });
          const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
          await dialog.getByLabel("Leaving at").fill(`${today.toISOString().slice(0, 10)}T13:30`);
          await d.pause(400);
          await d.type(dialog.getByRole("textbox", { name: "Reason" }), "Dentist appointment", 200);
          await d.type(dialog.getByRole("textbox", { name: "Collected by" }), "Suresh Patel", 200);
          await d.type(dialog.getByRole("textbox", { name: "Relation" }), "Father", 300);
          await d.tap(dialog.getByRole("button", { name: "Send request" }), 1300);
          prep("passtime");
        },
      },
      {
        as: "teacher", url: "/gate-pass", settle: 1000,
        run: async (d) => {
          d.caption("The class teacher *approves*");
          await d.tap(d.page.getByRole("button", { name: "Approve", exact: true }).first(), 1600);
        },
      },
      {
        as: "parent", url: "/gate-pass", settle: 1100,
        run: async (d) => {
          d.caption("A one-time code for the gate");
          await d.pause(1800);
          share.code = ((await d.page.locator("#main").innerText()).match(/\b\d{6}\b/) ?? [])[0];
        },
      },
      {
        as: "security", url: "/gate", settle: 1000,
        run: async (d) => {
          d.caption("The guard checks it: *right child, right person*");
          await d.scroll(420, 900);
          await d.type(d.page.getByRole("textbox", { name: "Gate pass code" }), share.code ?? "000000", 300);
          await d.tap(d.page.getByRole("button", { name: "Check", exact: true }), 1800);
          await d.pause(1500);
        },
      },
    ],
  },
  // 8 · Mon 30 Nov
  {
    slug: "who-hasnt-paid", kicker: "AI ASSISTANT", title: "Who hasn't paid? *Just ask.*",
    endLine: "Fee reminders on time, without the phone calls",
    segments: [
      {
        as: "admin", url: "/assistant", settle: 1000,
        run: async (d) => {
          await d.page.addStyleTag({ content: "#main p.mt-2.text-center.text-xs { visibility: hidden }" });
          d.caption("Quarter 3 fees: who's still pending?");
          await d.type(d.page.getByRole("textbox", { name: "Your question" }), "Fee defaulters in Class 9", 300);
          await d.tap(d.page.getByRole("button", { name: "Ask" }), 1500);
          d.caption("Names, amounts, *in seconds*");
          await d.scroll(320, 1100);
          await d.pause(1500);
        },
      },
      {
        as: "accounts", url: "/fees", settle: 1000,
        run: async (d) => {
          d.caption("Remind them all, *in one tap*");
          await d.tap(d.page.getByRole("button", { name: "Send reminders" }), 1200);
          await d.pause(1800);
        },
      },
    ],
  },
  // 9 · Wed 2 Dec
  {
    slug: "leave-from-sofa", kicker: "FOR PARENTS", title: "Child unwell? *Leave applied from the sofa.*",
    endLine: "Leave, attendance and messages, all in one app",
    before: () => prep("requests"),
    segments: [
      {
        as: "parent", url: "/leave", settle: 1000,
        run: async (d) => {
          d.caption("Fever at night? Tell the school *from home*");
          await d.tap(d.page.getByRole("button", { name: "Ask for leave" }).first(), 900);
          const dialog = d.page.getByRole("dialog");
          await d.tap(dialog.getByRole("combobox", { name: "Child" }), 400);
          await d.tap(d.page.getByRole("option", { name: /Aarav/ }), 400);
          await d.type(dialog.getByRole("textbox", { name: "Message to the teacher" }), "Fever since last night; doctor advised rest", 400);
          await d.tap(dialog.getByRole("button", { name: "Send request" }), 1400);
        },
      },
      {
        as: "teacher", url: "/leave", settle: 1000,
        run: async (d) => {
          d.caption("The class teacher sees it *first thing*");
          await d.type(d.page.getByRole("textbox", { name: /Note about Aarav Patel/ }).first(), "Get well soon, Aarav!", 300);
          await d.tap(d.page.getByRole("button", { name: "Approve", exact: true }).first(), 1500);
        },
      },
      {
        as: "parent", url: "/leave", settle: 1100,
        run: async (d) => {
          d.caption("Approved, with a note ❤️ *No absent mark*");
          await d.pause(2200);
        },
      },
    ],
  },
  // 10 · Fri 4 Dec
  {
    slug: "school-in-2-minutes", kicker: "GET STARTED", title: "Your school, *set up in 2 minutes.*",
    endLine: "Free for 14 days. No card needed.",
    before: () => prep("signup"),
    segments: [{
      as: null, url: "/signup?plan=pro&cycle=yearly", settle: 1500,
      run: async (d) => {
        const p = d.page;
        d.caption("Your school's name and ID");
        await d.scroll(900, 1200);
        await d.type(p.getByLabel("School name"), "Sunrise Academy", 250);
        await p.getByLabel("School ID").fill("sunrise-academy");
        await d.type(p.getByLabel("City"), "Ludhiana", 250);
        d.caption("Your details");
        await d.type(p.getByLabel("Your name"), "Meera Iyer", 200);
        await d.type(p.getByLabel("Work email"), "meera+sunrise@example.com", 200);
        await p.getByRole("textbox", { name: "Password", exact: true }).fill("Sunrise2026");
        await d.tap(p.getByRole("checkbox"), 400);
        const created = p.waitForResponse((r) => r.url().endsWith("/public/signup") && r.request().method() === "POST");
        await d.tap(p.getByRole("button", { name: "Create my school" }), 400);
        const code = (await (await created).json()).data?.debug_code ?? "";
        await d.pause(1200);
        d.caption("Confirm your email with a code");
        await d.type(p.getByLabel("Confirmation code"), code, 200);
        await p.waitForURL(/dashboard/, { timeout: 30000 });
        await d.pause(1200);
        d.caption("Your school is *ready* 🎉");
        await d.pause(2200);
      },
    }],
  },
];
