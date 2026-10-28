import { expect, test } from "./fixtures";

test("staff member signs in with a one-time code", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use a one-time code instead" }).click();
  await page.getByLabel("Email or mobile number").fill("hr@demo.com");
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/auth/login-code/request"));
  await page.getByRole("button", { name: "Send me a code" }).click();
  const res = await (await sent).json();
  test.skip(!res.data?.debug_code, "The API isn't running with OTP_DEBUG, so the code can't be read here.");
  await expect(page.getByText("a code is on its way")).toBeVisible();

  await page.getByLabel("Sign-in code").fill("000000" === res.data.debug_code ? "111111" : "000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That code is wrong or has expired")).toBeVisible();
  await page.getByLabel("Sign-in code").fill(res.data.debug_code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
