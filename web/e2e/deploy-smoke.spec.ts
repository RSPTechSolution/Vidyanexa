import { expect, test } from "./fixtures";

// Smoke test for a fresh production deployment (docs/DEPLOYMENT.md). Skipped unless pointed at one:
//   DEPLOY_URL=http://localhost:8081 DEPLOY_ADMIN=root@eduvia.local DEPLOY_PASSWORD=<temporary password> npx playwright test deploy-smoke
const URL = process.env.DEPLOY_URL;
test.skip(!URL, "Set DEPLOY_URL to check a deployment");

test("a fresh deployment: platform admin sets a password, adds a school, and its admin signs in", async ({ page, request }) => {
  const api = `${URL}/api/v1`;
  const email = process.env.DEPLOY_ADMIN!;
  const newPassword = `Deploy@${Date.now()}`;
  // Sign in with the temporary password and choose a real one (the API refuses most actions until then).
  const login = await (await request.post(`${api}/auth/login`, { data: { email, password: process.env.DEPLOY_PASSWORD } })).json();
  const auth = { Authorization: `Bearer ${login.data.tokens.access_token}` };
  expect(login.data.user.must_change_password).toBe(true);
  expect((await request.post(`${api}/auth/change-password`, { headers: auth, data: { current_password: process.env.DEPLOY_PASSWORD, new_password: newPassword } })).ok()).toBeTruthy();
  const again = await (await request.post(`${api}/auth/login`, { data: { email, password: newPassword } })).json();
  const slug = `smoke${Date.now().toString(36)}`;
  const school = await request.post(`${api}/schools`, { headers: { Authorization: `Bearer ${again.data.tokens.access_token}` }, data: {
    name: "Smoke Test School", slug, admin_full_name: "Smoke Admin", admin_email: `admin@${slug}.example.in`, admin_password: "Smoke@12345", plan_code: "max",
  } });
  expect(school.status()).toBe(201);

  await page.goto(`${URL}/login`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Email").fill(`admin@${slug}.example.in`);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Smoke@12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Smoke Test School").first()).toBeVisible();
  // Public files and the API are served from the same address through nginx.
  expect((await request.get(`${api}/health`)).ok()).toBeTruthy();
});
