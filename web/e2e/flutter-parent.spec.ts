import { expect, test } from "@playwright/test";
/**
 * Drives the Flutter parent app (web build) against the real API.
 * Build and serve it first:
 *   cd mobile && flutter build web --dart-define=FLAVOR=parent
 *   cd build/web && python -m http.server 8090
 * Run with: npx playwright test --project=flutter
 */
test.use({ viewport: { width: 412, height: 860 }, baseURL: "http://localhost:8090" });
test("flutter parent app end to end", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForSelector("flt-glass-pane, flutter-view", { timeout: 30_000 });
  await page.waitForTimeout(2500);
  // Turn on Flutter's accessibility tree so fields are real DOM elements.
  await page.evaluate(() => (document.querySelector("flt-semantics-placeholder") as HTMLElement | null)?.click());
  await page.waitForTimeout(800);

  for (const [name, value] of [[/Email/, "parent@demo.com"], [/Password/, "Demo@1234"]] as const) {
    const field = page.getByRole("textbox", { name });
    await field.click();
    await page.waitForTimeout(250);
    await page.keyboard.type(value, { delay: 15 });
    await expect(field).toHaveValue(value);
  }
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Suresh/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // The new tabs load real data.
  await page.getByRole("tab", { name: "Fees" }).click();
  await expect(page.getByText(/Total due for all children/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Attendance" }).click();
  await expect(page.getByLabel(/attendance this year/).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Homework" }).click();
  await expect(page.getByText(/To do|Done|Overdue/).first()).toBeVisible({ timeout: 15_000 });

  // Everything else lives under More.
  await page.getByRole("tab", { name: "More" }).click();
  await page.getByRole("button", { name: /Timetable/ }).click();
  await expect(page.getByText(/Assembly/)).toBeVisible({ timeout: 15_000 });
  await page.goBack();
  // Flutter only exposes on-screen items, so scroll the More list until an item appears.
  const scrollTo = async (name: RegExp) => {
    for (let i = 0; i < 12 && !(await page.getByRole("button", { name }).isVisible()); i++) {
      await page.mouse.move(200, 400);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(250);
    }
  };
  await scrollTo(/Results/);
  await page.getByRole("button", { name: /Results/ }).click();
  await expect(page.getByText(/Half-Yearly/).first()).toBeVisible({ timeout: 15_000 });
  await page.goBack();
  await scrollTo(/Profile & settings/);
  await page.getByRole("button", { name: /Profile & settings/ }).click();
  await expect(page.getByRole("button", { name: /Change password/ })).toBeVisible();
  await page.waitForTimeout(500);

  // Session survives a reload (tokens persisted, /auth/me restores it).
  await page.reload();
  await page.waitForTimeout(3000);
  await page.evaluate(() => (document.querySelector("flt-semantics-placeholder") as HTMLElement | null)?.click());
  await expect(page.getByText(/Suresh/).first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
