import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { DEMO, login } from "./helpers";

/**
 * Accessibility checks (axe, WCAG 2.1 A and AA): colour contrast, labels, names, landmarks and ARIA, on the public site
 * and the main app pages for each role, in light and in dark.
 */
async function scan(page: Page, where: string) {
  await page.waitForLoadState("networkidle");
  // Let entrance animations finish so contrast is measured on the settled page.
  await page.waitForTimeout(700);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Charts are decorative pictures of numbers that are also given in text.
    .exclude(".recharts-wrapper")
    .analyze();
  const problems = result.violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
    });

    test("public website pages are accessible", async ({ page }) => {
      for (const path of ["/", "/pricing", "/features", "/about", "/contact", "/signup", "/login"]) {
        await page.goto(path);
        await scan(page, path);
      }
    });

    test("school admin pages are accessible", async ({ page }) => {
      await login(page, DEMO.admin, DEMO.password);
      for (const path of ["/dashboard", "/students", "/fees", "/attendance", "/notices", "/settings/users", "/settings/school", "/settings/storage"]) {
        await page.goto(path);
        await scan(page, path);
      }
    });

    test("teacher pages are accessible", async ({ page }) => {
      await login(page, DEMO.teacher, DEMO.password);
      for (const path of ["/dashboard", "/my-class", "/homework", "/my-timetable"]) {
        await page.goto(path);
        await scan(page, path);
      }
    });
  });
}
