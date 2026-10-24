// Attendance reels. Each starts from an empty register for today (see reset_today.py).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../api");
const py = (script) => execFileSync(path.join(api, "venv/Scripts/python.exe"), [`../web/scripts/social/${script}`],
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" });
export function before() {
  py("reset_today.py");
}

const openClass = async (d) => {
  d.caption("Open your class on your phone");
  await d.tap(d.page.getByRole("link", { name: /Class 5 – A/ }), 1200);
};

export default [
  {
    slug: "ten-seconds", kicker: "ATTENDANCE", title: "Take attendance in *10 seconds.*",
    endLine: "Attendance, fees, exams and parent apps in one place",
    segments: [{
      as: "teacher", url: "/attendance",
      run: async (d) => {
        await openClass(d);
        d.caption("Everyone here? *One tap.*");
        await d.tap(d.page.getByRole("button", { name: "Mark rest present" }), 1100);
        d.caption("Save, and you're done");
        await d.tap(d.page.getByRole("button", { name: "Save attendance" }), 2200);
        d.caption("Whole class marked in *10 seconds*");
        await d.pause(1800);
      },
    }],
  },
  {
    slug: "parents-told", kicker: "ATTENDANCE", title: "Parents know *the moment* a child is absent.",
    endLine: "Parents see attendance, homework and fees on their phone",
    segments: [
      {
        as: "teacher", url: "/attendance",
        run: async (d) => {
          await openClass(d);
          d.caption("Aarav isn't in class today");
          await d.tap(d.page.getByRole("radiogroup", { name: "Attendance for Aarav Patel" }).getByRole("radio", { name: "Absent" }), 900);
          await d.type(d.page.getByRole("textbox", { name: "Reason for Aarav Patel" }), "Fever", 600);
          d.caption("Everyone else present, and *save*");
          await d.tap(d.page.getByRole("button", { name: "Mark rest present" }), 800);
          await d.tap(d.page.getByRole("button", { name: "Save attendance" }), 1500);
        },
      },
      {
        as: "parent", url: "/dashboard", settle: 1200,
        run: async (d) => {
          d.caption("Seconds later, on his father's phone");
          await d.pause(1300);
          await d.tap(d.page.getByRole("button", { name: /^Notifications/ }), 2200);
          d.caption("Absent today: *Aarav Patel*");
          await d.pause(2200);
        },
      },
    ],
  },
  {
    slug: "scan-cards", kicker: "ATTENDANCE", title: "Scan ID cards *at the gate.*",
    endLine: "ID cards, QR scanning and biometric machines included",
    segments: [{
      as: "teacher", url: "/attendance/scan",
      run: async (d) => {
        d.caption("Scan the card, or type the number");
        for (const no of ["GV20250001", "GV20200081", "GV20230082"]) {
          await d.type(d.page.getByRole("textbox", { name: "Admission number" }), no, 300);
          await d.tap(d.page.getByRole("button", { name: "Mark present" }), 900);
          if (no === "GV20250001") d.caption("Logged *instantly*");
        }
        d.caption("Late after the cut-off, *automatically*");
        await d.pause(1800);
      },
    }],
  },
  {
    slug: "skipped-lessons", kicker: "ATTENDANCE", title: "Catch students who *skip lessons.*",
    endLine: "Period-by-period attendance for every class",
    segments: [{
      as: "teacher", url: "/attendance/periods",
      run: async (d) => {
        d.caption("Every period of your class, one list");
        await d.pause(900);
        await d.tap(d.page.getByRole("button", { name: /Mathematics/ }), 1200);
        d.caption("Tick who's *missing* from this lesson");
        await d.scroll(260);
        await d.tap(d.page.getByRole("checkbox", { name: /Shaurya Kapoor/ }), 900);
        const save = d.page.getByRole("button", { name: /^Save/ }).first();
        await d.tap(save, 1600);
        d.caption("Present at roll call, missing in Maths: *flagged*");
        await d.pause(1800);
      },
    }],
  },
  {
    slug: "below-75", kicker: "ATTENDANCE", title: "See who's slipping, *before it's a problem.*",
    endLine: "Reports for every class, ready to download",
    before: () => py("fill_today.py"), // a real school day: most present, a few absent or late
    segments: [
      {
        as: "admin", url: "/attendance", settle: 1200,
        run: async (d) => {
          d.caption("Today, across the whole school");
          await d.pause(1500);
          await d.scroll(560, 1500);
          await d.pause(1300);
        },
      },
      {
        as: "admin", url: "/assistant", settle: 1000,
        run: async (d) => {
          // The local demo has no AI key; its "add an AI key" note isn't for viewers (the live site uses Gemini).
          await d.page.addStyleTag({ content: "#main p.mt-2.text-center.text-xs { visibility: hidden }" });
          d.caption("Just ask, in plain words");
          await d.type(d.page.getByRole("textbox", { name: "Your question" }), "Which students are below 75% attendance?", 400);
          await d.tap(d.page.getByRole("button", { name: "Ask" }), 1800);
          d.caption("Below 75%? You'll *see it first*");
          await d.scroll(300, 1100);
          await d.pause(1600);
        },
      },
    ],
  },
];
