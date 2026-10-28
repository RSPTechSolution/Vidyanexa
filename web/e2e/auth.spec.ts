import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { DEMO, login, loginAsAdmin } from "./helpers";

test("login form validates before submitting", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email")).toBeVisible();
  await expect(page.getByText("Enter your password")).toBeVisible();
});

test("wrong password shows one generic error", async ({ page }) => {
  await login(page, "nobody@demo.com", "wrong-pass-1");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email" })).toContainText("Invalid email, password or school");
  await expect(page).toHaveURL(/\/login/);
});

test("admin signs in, sees the school dashboard and admin navigation", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Anita");
  await expect(page.getByText("Green Valley Public School").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const item of ["Dashboard", "School profile", "Modules", "Users & roles", "Audit log"]) {
    await expect(nav.getByRole("link", { name: item })).toBeVisible();
  }
  await expect(page.getByText("Set up your school")).toBeVisible();
});

test("tokens are httpOnly cookies, never readable by page scripts", async ({ page, context }) => {
  await loginAsAdmin(page);
  const cookies = await context.cookies();
  const auth = cookies.filter((c) => c.name.startsWith("ev_"));
  expect(auth.map((c) => c.name).sort()).toEqual(["ev_at", "ev_rt"]);
  expect(auth.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("ev_");
});

test("expired access cookie is refreshed transparently", async ({ page, context }) => {
  await loginAsAdmin(page);
  const before = (await context.cookies()).find((c) => c.name === "ev_rt")!.value;
  await context.clearCookies({ name: "ev_at" });
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Users & roles" })).toBeVisible();
  const after = await context.cookies();
  expect(after.find((c) => c.name === "ev_at")).toBeTruthy();
  expect(after.find((c) => c.name === "ev_rt")!.value).not.toBe(before); // rotated
});

test("sign out ends the session", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(async () => {
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("deep link survives sign-in", async ({ page }) => {
  await page.goto("/settings/audit");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Faudit/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Email").fill(DEMO.admin);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/settings\/audit/);
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});

test("teacher cannot see or open admin pages", async ({ page }) => {
  await login(page, DEMO.teacher, DEMO.password);
  await expect(page).toHaveURL(/\/dashboard/);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Users & roles" })).toHaveCount(0);
  await page.goto("/settings/users");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test("forgot password responds the same for any email", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  await page.getByLabel("Email").fill("someone-unknown@demo.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("login and dashboard have no serious accessibility violations", async ({ page }) => {
  // Cards further down fade in as they scroll into view; with reduced motion they're simply shown, so axe measures
  // the colours people actually see rather than a card that hasn't been scrolled to yet.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  const loginScan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(loginScan.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);

  await loginAsAdmin(page);
  await expect(page.getByText("Set up your school")).toBeVisible();
  // Let entrance animations settle; axe measures contrast on half-faded elements otherwise.
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".card-lift")].every((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).opacity !== "1") return false;
      return true;
    }),
  );
  const dash = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(dash.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
});
