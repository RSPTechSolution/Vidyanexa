import { expect, test } from "./fixtures";

// The public pages fit every screen: nothing (such as the animated circle behind the app screenshot, or the header's
// buttons on a tablet) may push the page wider than the screen and make it scroll sideways.
const PAGES = ["/", "/features", "/features/school-fee-management-software", "/pricing", "/about", "/contact", "/signup", "/login"];

for (const width of [360, 390, 768, 1024]) {
  test(`public pages don't scroll sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { scroll, view } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
      expect(scroll, `${path} at ${width}px`).toBeLessThanOrEqual(view);
    }
  });
}

test("tablets get the menu button, not a header too wide for the screen", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});
