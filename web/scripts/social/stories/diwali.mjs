// Diwali reels, in the festive look of the Diwali posts (theme: "diwali"). Recorded signed out on the public website,
// so no demo data is needed: node scripts/social/reels.mjs diwali [n]

// Scroll so that `locator` sits `offset` px from the top of the screen, smoothly.
async function scrollTo(d, locator, offset = 120, ms = 1100) {
  const dy = await locator.first().evaluate((el, off) => el.getBoundingClientRect().top - off, offset);
  await d.scroll(dy, ms);
}

const stories = [
  // 1 · The Diwali offer: the website, then the free trial.
  {
    slug: "light-up", theme: "diwali", kicker: "DIWALI OFFER", title: "This Diwali, *light up* your school.",
    endLine: "Diwali offer · Free for 14 days, no card needed", cta: "Start free today",
    segments: [{
      as: null, url: "/", settle: 1200,
      run: async (d) => {
        const p = d.page;
        d.caption("Your whole school, *one app*");
        await d.pause(1800);
        d.caption("Attendance, fees, exams, *transport*");
        await d.scroll(900, 1600);
        await d.pause(900);
        await d.scroll(900, 1600);
        await d.pause(900);
        d.caption("Apps for *parents, teachers and drivers*");
        await d.scroll(1100, 1700);
        await d.pause(1200);
        await d.scroll(-(await p.evaluate(() => document.scrollingElement.scrollTop)), 1400);
        d.caption("Start free this Diwali ✨");
        await d.tap(p.getByRole("link", { name: /Start 14-day free trial/ }).first(), 1800);
        d.caption("14 days free. *No card needed.*");
        await d.pause(2000);
      },
    }],
  },
  // 2 · 2 months free when paying yearly.
  {
    slug: "two-months-free", theme: "diwali", kicker: "DIWALI OFFER", title: "Pay yearly, get *2 months free.*",
    endLine: "Pay for 10 months, use all 12", cta: "Start free today",
    segments: [{
      as: null, url: "/pricing", settle: 1200,
      run: async (d) => {
        const p = d.page;
        await d.tap(p.getByRole("radio", { name: "Monthly" }), 300);
        await scrollTo(d, p.getByRole("heading", { name: "Basic" }), 200, 900);
        d.caption("Basic, paid monthly: *₹2,999*");
        await d.pause(1500);
        await scrollTo(d, p.getByRole("radio", { name: "Monthly" }), 260, 800);
        d.caption("Now switch to *yearly* 🎁");
        await d.tap(p.getByRole("radio", { name: /Yearly/ }), 600);
        await scrollTo(d, p.getByRole("heading", { name: "Basic" }), 200, 900);
        d.caption("*₹2,499* a month. 2 months free");
        await d.pause(1800);
        await scrollTo(d, p.getByRole("heading", { name: "Pro" }), 200, 1300);
        d.caption("Pro: *₹6,666* a month, billed yearly");
        await d.pause(1800);
        await scrollTo(d, p.getByRole("heading", { name: "Max" }), 200, 1300);
        d.caption("Max: *₹14,999*. Unlimited students");
        await d.pause(1800);
      },
    }],
  },
  // 3 · Build a custom plan: only the modules the school needs.
  {
    slug: "custom-plan", theme: "diwali", kicker: "CUSTOM PLAN", title: "Your school, *your plan.*",
    endLine: "Pay only for what your school uses", cta: "Build your plan",
    segments: [{
      as: null, url: "/pricing#custom", settle: 1400,
      run: async (d) => {
        const p = d.page;
        const builder = p.locator("#custom");
        await scrollTo(d, builder.getByText("1. How many students?"), 140, 600);
        d.caption("Only need *some* modules?");
        await d.pause(1300);
        d.caption("1. How many students?");
        const count = builder.getByRole("spinbutton", { name: "Number of students" });
        // The box corrects each keystroke (below 50 becomes 50), so set the number in one go, as a paste would.
        await d.tap(count, 300);
        await count.fill("650");
        await d.pause(1200);
        d.caption("2. Pick only what you need");
        await scrollTo(d, builder.getByRole("checkbox", { name: /Examinations/ }), 260, 900);
        for (const m of [/Examinations/, /Transport/, /AI Assistant/]) {
          const box = builder.getByRole("checkbox", { name: m });
          await scrollTo(d, box, 380, 600);
          await d.tap(box, 700);
        }
        d.caption("Your price updates *as you go*");
        await scrollTo(d, builder.getByText("Your custom plan"), 160, 1400);
        await d.pause(2200);
        d.caption("Start free with *your* plan ✨");
        await d.tap(builder.getByRole("link", { name: /Start free trial with this plan/ }).or(builder.getByRole("button", { name: /Start free trial with this plan/ })), 1800);
        d.caption("14 days free. *No card needed.*");
        await d.pause(1800);
      },
    }],
  },
];

export default stories;
