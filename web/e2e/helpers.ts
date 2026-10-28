import { expect, type Page } from "@playwright/test";

export const DEMO = {
  slug: "demo",
  password: "Demo@1234",
  admin: "admin@demo.com",
  teacher: "teacher@demo.com",
  superAdmin: { email: "superadmin@eduvia.com", password: "Admin@1234" },
};

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  // Wait for hydration (the button is disabled until then), then type.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  const emailField = page.getByLabel("Email");
  const passwordField = page.getByRole("textbox", { name: "Password", exact: true });
  // A late re-render can clear what was typed, so fill until both stick.
  await expect(async () => {
    await emailField.fill(email);
    await passwordField.fill(password);
    await expect(emailField).toHaveValue(email, { timeout: 500 });
    await expect(passwordField).toHaveValue(password, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function loginAsAdmin(page: Page) {
  await login(page, DEMO.admin, DEMO.password);
  await expect(page).toHaveURL(/\/dashboard/);
}

export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

/** Calls the API directly as a demo user, for test setup the UI would make slow. */
export async function apiAs(email: string, password = DEMO.password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, school_slug: DEMO.slug }),
  });
  const token = (await res.json()).data.tokens.access_token as string;
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${API}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    return (await r.json()).data;
  };
}
