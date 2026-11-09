// The December reels (posting order in brand/social/feed-2026-11-09.md). Each prepares the demo school it starts from
// (prep_reels.py), so any reel can be re-recorded on its own: node scripts/social/reels.mjs dec <n>
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../api");
const prep = (...steps) => execFileSync(path.join(api, "venv/Scripts/python.exe"), ["../web/scripts/social/prep_reels.py", ...steps],
  { cwd: api, env: { ...process.env, PYTHONPATH: "." }, stdio: "ignore" });

// The next Saturday after today, as YYYY-MM-DD (an enquiry's follow-up: a school visit).
const saturday = () => {
  const d = new Date(); d.setDate(d.getDate() + (((6 - d.getDay()) + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let reportUrl = "/my-results"; // set by the report card reel's first scene

export default [
  // 1 · Mon 7 Dec
  {
    slug: "report-card", kicker: "REPORT CARDS", title: "Report cards, *on every parent's phone.*",
    endLine: "Marks, grades and report cards, published in one tap",
    // Two scenes: the tap on the results list, then the report card already loaded (on a slow machine it can take
    // seconds to open, which shouldn't be on camera). The second scene's address is the link the first one tapped.
    segments: [{
      as: "parent", url: "/my-results", settle: 1100, hold: 250,
      ready: (p) => p.getByRole("link", { name: /Half-Yearly/ }).first().waitFor(),
      run: async (d) => {
        d.caption("Results are out. *No queue at school.*");
        await d.pause(2300);
        reportUrl = await d.page.getByRole("link", { name: /Half-Yearly/ }).first().getAttribute("href");
        const link = d.page.getByRole("link", { name: /Half-Yearly/ }).first();
        await link.evaluate((a) => a.addEventListener("click", (e) => e.preventDefault(), { once: true })); // stay put; scene 2 opens it
        await d.tap(link, 250);
      },
    }, {
      as: "parent", get url() { return reportUrl; }, settle: 900, noWhoosh: true,
      ready: (p) => p.getByRole("table", { name: "Marks by subject" }).waitFor(),
      run: async (d) => {
        d.caption("The full report card 📄");
        await d.pause(1500);
        await d.scroll(330, 1300);
        d.caption("Every subject, *marks and grade*");
        await d.pause(1500);
        await d.scroll(420, 1300);
        d.caption("Download the PDF, or *print it*");
        await d.pause(1200);
        await d.scroll(-750, 1200);
        await d.pause(900);
      },
    }],
  },
  // 2 · Fri 11 Dec
  {
    slug: "substitution", kicker: "SUBSTITUTIONS", title: "Teacher on leave? *Every period covered.*",
    endLine: "Timetables and substitutions, sorted before the first bell",
    before: () => prep("subs"),
    segments: [{
      as: "admin", url: "/substitutions", settle: 1100,
      ready: (p) => p.getByText("Everyone is in").waitFor(),
      run: async (d) => {
        d.caption("7:30 am. *Mr Saxena is on leave.*");
        await d.tap(d.page.getByRole("combobox", { name: "Teacher away" }), 700);
        await d.tap(d.page.getByRole("option", { name: /Amit Saxena/ }), 500);
        await d.tap(d.page.getByRole("button", { name: "Mark away" }), 1300);
        d.caption("His 6 periods, *all in one place*");
        await d.scroll(220, 900);
        await d.pause(600);
        const covers = d.page.getByRole("combobox", { name: /^Cover for/ });
        d.caption("Free teachers first, *who teach the subject on top*");
        for (let i = 0; i < 3; i++) {
          await d.tap(covers.nth(i), 900);
          await d.tap(d.page.getByRole("option").nth(1), 900);
        }
        d.caption("Each substitute is told *on their phone* 📲");
        await d.pause(1700);
      },
    }],
  },
  // 3 · Mon 14 Dec
  {
    slug: "admission-enquiry", kicker: "ADMISSIONS 2027-28", title: "Every admission enquiry, *followed up.*",
    endLine: "Admissions, from first call to first day",
    before: () => prep("enquiry"),
    segments: [{
      as: "reception", url: "/admissions", settle: 1100,
      ready: (p) => p.getByRole("list", { name: "Enquiries" }).waitFor(),
      run: async (d) => {
        d.caption("A family walks in, *asking about LKG*");
        await d.tap(d.page.getByRole("button", { name: "New enquiry" }), 900);
        const dlg = d.page.getByRole("dialog");
        await d.type(dlg.getByRole("textbox", { name: "Child's name" }), "Gurleen Kaur", 200);
        await d.tap(dlg.getByRole("combobox", { name: "Class wanted" }), 500);
        await d.tap(d.page.getByRole("option", { name: "LKG", exact: true }), 400);
        await d.type(dlg.getByRole("textbox", { name: "Parent's name" }), "Manpreet Singh", 200);
        await d.type(dlg.getByRole("textbox", { name: "Phone" }), "9876543210", 300);
        d.caption("Set a follow-up, *so nobody is forgotten*");
        await dlg.getByRole("textbox", { name: "Follow up on" }).fill(saturday());
        await d.pause(900);
        await d.tap(dlg.getByRole("button", { name: "Save enquiry" }), 450);
        d.caption("Saved, *on the admissions list*");
        await d.pause(1800);
        await d.tap(d.page.getByRole("button", { name: /Gurleen Kaur/ }).first(), 1200);
        d.caption("Visit booked for Saturday ✅");
        await d.tap(d.page.getByRole("dialog").getByRole("combobox", { name: "Stage" }), 600);
        await d.tap(d.page.getByRole("option", { name: /Visit/ }), 1200);
        await d.pause(2300);
      },
    }],
  },
  // 4 · Fri 18 Dec
  {
    slug: "ptm-booking", kicker: "PARENT-TEACHER MEETING", title: "PTM day, *no crowd at the door.*",
    endLine: "Parents and teachers, closer every day",
    before: () => prep("ptm"),
    segments: [
      {
        as: "parent", url: "/ptm", settle: 1100,
        ready: (p) => p.getByRole("group", { name: "Times for Aarav Patel" }).waitFor(),
        run: async (d) => {
          d.caption("PTM on Saturday. *Pick a time.*");
          await d.pause(2300);
          await d.tap(d.page.getByRole("group", { name: "Times for Aarav Patel" }).getByRole("button", { name: "10:30" }), 450);
          d.caption("Booked: *10:30 with Ms Verma* ✅");
          await d.pause(2600);
        },
      },
      {
        as: "teacher", url: "/ptm", settle: 1100,
        ready: (p) => p.getByText("Aarav Patel").first().waitFor(),
        run: async (d) => {
          d.caption("Ms Verma sees *who's coming, and when*");
          await d.pause(2600);
        },
      },
    ],
  },
  // 5 · Mon 21 Dec
  {
    slug: "library-issue", kicker: "LIBRARY", title: "Winter break reading, *issued in seconds.*",
    endLine: "Library, fines and reminders, all on one system",
    before: () => prep("library"),
    segments: [
      {
        as: "librarian", url: "/library", settle: 1100,
        ready: (p) => p.getByRole("table", { name: "Issued books" }).waitFor(),
        run: async (d) => {
          d.caption("Book number, *then the student's*");
          await d.type(d.page.getByRole("textbox", { name: "Accession no.", exact: true }), "00010", 300);
          await d.type(d.page.getByRole("textbox", { name: "Borrower" }), "GV20250001", 600);
          await d.tap(d.page.getByRole("button", { name: "Issue", exact: true }), 450);
          d.caption("Issued ✅ *Due date set for you*");
          await d.pause(2400);
        },
      },
      {
        as: "parent", url: "/my-library", settle: 1100,
        ready: (p) => p.getByText("Panchatantra Tales").first().waitFor(),
        run: async (d) => {
          d.caption("Parents see the book *and when it's due*");
          await d.pause(2600);
        },
      },
    ],
  },
  // 6 · Wed 23 Dec
  {
    slug: "transfer-certificate", kicker: "CERTIFICATES", title: "A TC in *one minute.* Not one week.",
    endLine: "Transfer, bonafide and character certificates, with serial numbers",
    before: () => prep("tc"),
    after: () => prep("tc"),
    segments: [{
      as: "admin", url: "/certificates", settle: 1100,
      ready: (p) => p.getByRole("table").first().waitFor(),
      run: async (d) => {
        d.caption("A family is moving cities. *They need a TC.*");
        await d.tap(d.page.getByRole("button", { name: "Issue certificate" }), 900);
        const dlg = d.page.getByRole("dialog");
        await d.tap(dlg.getByRole("tab", { name: "Transfer (TC)" }), 500);
        await d.type(dlg.getByRole("textbox", { name: "Search students" }), "Aarav Patel", 600);
        await d.tap(dlg.getByRole("button", { name: /Aarav Patel/ }).first(), 700);
        d.caption("Class, conduct and dates *filled in for you*");
        await d.type(dlg.getByRole("textbox", { name: "Reason for leaving" }), "Family moving to Mohali", 300);
        // Keep the demo child active: the take is undone afterwards anyway.
        const left = dlg.getByRole("switch", { name: /Mark the student as left/ });
        if (await left.isChecked()) await left.click();
        await d.tap(dlg.getByRole("button", { name: "Issue certificate" }), 400);
        d.caption("Issued, with its *own serial number* ✅");
        await d.pause(3200);
      },
    }],
  },
];
