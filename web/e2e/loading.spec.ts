import { expect, test } from "./fixtures";
import { DEMO, loginAsAdmin } from "./helpers";

const slow = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("sign-in button shows a clear busy state", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => { await slow(1500); await route.continue(); });
  await page.goto("/login");
  const button = page.getByRole("button", { name: "Sign in" });
  await expect(button).toBeEnabled();
  await page.getByLabel("Email").fill(DEMO.admin);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(DEMO.password);
  await button.click();
  const busy = page.locator("button[aria-busy=true]");
  await expect(busy).toContainText(/Signing in…|Opening your dashboard…/);
  await expect(busy).toBeDisabled();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("clicking a link shows the top progress bar and the page loader", async ({ page }) => {
  await loginAsAdmin(page);
  // The chart only renders after hydration and a data fetch, so the app is interactive.
  await expect(page.getByText("people", { exact: true })).toBeVisible({ timeout: 30_000 });
  // Slow down the server render of the next page.
  await page.route("**/settings/audit**", async (route) => { await slow(1500); await route.continue(); });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByTestId("nav-progress")).toHaveAttribute("data-state", "loading");
  await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();
  // The bar keeps running for as long as the loading screen is on show.
  await page.waitForTimeout(600);
  await expect(page.getByTestId("nav-progress")).toHaveAttribute("data-state", "loading");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("nav-progress")).toHaveAttribute("data-state", "idle");
});

test("saving shows a busy button and the progress bar", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/school");
  await page.route("**/api/proxy/schools/current", async (route) => {
    if (route.request().method() === "PATCH") await slow(1500);
    await route.continue();
  });
  await page.getByLabel("City").fill(`Chandigarh ${Date.now() % 1000}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("button[aria-busy=true]")).toHaveText("Saving…");
  await expect(page.getByTestId("nav-progress")).toHaveAttribute("data-state", "loading");
  await expect(page.getByText("School profile saved")).toBeVisible();
});

test("searching a table shows that results are updating", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/users");
  // A real data row (not a loading placeholder) means the page is interactive.
  await expect(page.getByRole("row").filter({ hasText: "@demo.com" }).first()).toBeVisible({ timeout: 30_000 });
  await page.route(/\/api\/proxy\/users\?/, async (route) => { await slow(1500); await route.continue(); });
  await page.getByLabel("Search users").fill("priya");
  await expect(page.locator(`[role=status][aria-label="Updating results"]`)).toBeVisible();
  await expect(page.locator(`[role=status][aria-label="Updating results"]`)).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("row").filter({ hasText: "teacher@demo.com" })).toBeVisible();
});
