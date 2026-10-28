import { accentTokens } from "../src/lib/theme/palette";
import { expect, test } from "./fixtures";
import { DEMO, apiAs, login } from "./helpers";

test("platform admin checks health, backs up, and posts a banner schools can see", async ({ page, browser }) => {
  await login(page, DEMO.superAdmin.email, DEMO.superAdmin.password);
  await expect(page).toHaveURL(/\/(dashboard|platform)/);
  await page.goto("/platform/system");
  await expect(page.getByText("Database", { exact: true })).toBeVisible();
  await expect(page.getByText(/Everything is working|Something needs attention/)).toBeVisible();

  await page.getByRole("tab", { name: "Backups" }).click();
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByText(/Backup made: .* rows/)).toBeVisible();

  const text = `E2E maintenance notice ${Date.now()}`;
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  const admin = await browser.newPage();
  await login(admin, DEMO.admin, DEMO.password);
  await expect(admin).toHaveURL(/\/dashboard/);
  await expect(admin.getByRole("status").filter({ hasText: text })).toBeVisible();
  await admin.getByRole("button", { name: "Hide this message" }).click();
  await expect(admin.getByText(text)).toHaveCount(0);
  await admin.close();

  await page.getByLabel("Message", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
});

test("school admin picks a school colour and downloads the school's data", async ({ page }) => {
  const admin = await apiAs(DEMO.admin);
  await admin("PATCH", "/schools/current", { settings: { brand_color: "#15233F" } });
  await login(page, DEMO.admin, DEMO.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings/school");
  await page.getByRole("radio", { name: "Teal" }).click();
  await expect(page.getByText("Preview: Teal")).toBeVisible();
  await page.getByRole("button", { name: "Use Teal" }).click();
  await expect(page.getByText(/Colour saved/)).toBeVisible();
  // The page reloads, and the server sends the school's full colour scheme with it, built from the colour.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()).catch(() => ""))
    .toBe(accentTokens("#0f766e", false).primary);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all school data" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await admin("PATCH", "/schools/current", { settings: { brand_color: "#15233F" } });
});
