import { expect, test } from "./fixtures";
import { DEMO, login, loginAsAdmin, unique } from "./helpers";

test("admin creates a user who must then set their own password", async ({ page, browser }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/users");
  const name = `E2E ${unique("Teacher")}`;
  const email = `${unique("e2e")}@demo.com`;

  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Phone").fill("+91 98765 43210");
  const tempPassword = await dialog.getByLabel("Temporary password").inputValue();
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`Account created for ${name}`)).toBeVisible();

  await page.getByLabel("Search users").fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Password pending")).toBeVisible();

  // The new teacher is forced to the account page until they change the password.
  const ctx = await browser.newContext();
  const teacher = await ctx.newPage();
  await login(teacher, email, tempPassword);
  await expect(teacher).toHaveURL(/\/account\?required=1/);
  await expect(teacher.getByText("Set your own password to continue")).toBeVisible();
  await teacher.getByLabel("Current password").fill(tempPassword);
  await teacher.getByRole("textbox", { name: "New password", exact: true }).fill("MyNewPass9");
  await teacher.getByLabel("Confirm new password").fill("MyNewPass9");
  await teacher.getByRole("button", { name: "Update password" }).click();
  await expect(teacher.getByText("Password changed")).toBeVisible();
  await teacher.goto("/dashboard");
  await expect(teacher).toHaveURL(/\/dashboard/);
  await ctx.close();
});

test("duplicate email is reported on the field", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Duplicate Person");
  await dialog.getByLabel("Email").fill(DEMO.teacher);
  await dialog.getByLabel("Phone").fill("+91 98765 43210");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog.getByText("A user with this email already exists")).toBeVisible();
});

test("school profile edits persist", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/school");
  const phone = `+91 98${Math.floor(10000000 + Math.random() * 89999999)}`;
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("Address").fill("Sector 17, Madhya Marg");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("School profile saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Phone")).toHaveValue(phone);
  // Regression: saving once silently changed the time zone. It must stay as stored.
  await expect(page.getByLabel("Time zone")).toContainText("Asia/Kolkata");
  const school = await page.request.get("/api/proxy/schools/current");
  expect((await school.json()).data.timezone).toBe("Asia/Kolkata");
});

test("module toggle persists and is audited", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/modules");
  const library = page.getByRole("switch", { name: "Library" });
  const wasOn = (await library.getAttribute("aria-checked")) === "true";
  await library.click();
  await expect(page.getByText(`Library ${wasOn ? "disabled" : "enabled"}`)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Library" })).toHaveAttribute("aria-checked", String(!wasOn));
  await page.getByRole("switch", { name: "Library" }).click(); // restore

  await page.goto("/settings/audit");
  await expect(page.getByText(/the library module/i).first()).toBeVisible();
});

test("command palette navigates", async ({ page }) => {
  await loginAsAdmin(page);
  const input = page.getByPlaceholder("Search pages and actions…");
  // The shortcut listener attaches after hydration (slow on first dev compile), so retry.
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await input.fill("audit");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/audit/);
});

test("super admin provisions a school whose admin can sign in", async ({ page, browser }) => {
  await login(page, DEMO.superAdmin.email, DEMO.superAdmin.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/platform/schools");
  const slug = unique("e2e-school-");
  await page.getByRole("button", { name: "New school" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("School name").fill(`E2E Academy ${slug}`);
  await dialog.getByLabel("School ID").fill(slug);
  await dialog.getByLabel("Full name").fill("E2E Principal");
  await dialog.getByLabel("Email").fill(`head+${slug}@example.com`);
  const pw = await dialog.getByLabel("Temporary password").inputValue();
  await dialog.getByRole("button", { name: "Create school" }).click();
  await expect(page.getByText(`E2E Academy ${slug} is ready`)).toBeVisible();

  const ctx = await browser.newContext();
  const head = await ctx.newPage();
  await login(head, `head+${slug}@example.com`, pw);
  await expect(head).toHaveURL(/\/account\?required=1/);
  await ctx.close();
});
