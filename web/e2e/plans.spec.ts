import { expect, test } from "./fixtures";
import { DEMO, login, unique } from "./helpers";

test("public pages load and link together", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Run your whole school");
  for (const [link, heading] of [["Pricing", "School management software pricing: plans that grow with your school"], ["About", "Less paperwork. More teaching."], ["Contact", "Let's talk about your school"]] as const) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link }).click();
    // First visit compiles the page in dev mode, which can take a while.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading, { timeout: 45_000 });
  }
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of service");
});

test("pricing shows INR plans and the custom builder reprices live", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Basic", exact: true })).toBeVisible();
  await expect(page.getByText("₹2,999").first()).toBeVisible(); // comparison table, monthly price
  await page.getByRole("radio", { name: /Monthly/ }).click();
  const basic = page.locator("article").filter({ has: page.getByRole("heading", { name: "Basic", exact: true }) });
  await expect(basic.getByText("₹2,999")).toBeVisible();
  // Prices are shown + GST, with the total including 18% GST: 2,999 × 1.18 = 3,538.82.
  await expect(basic.getByText("/month + GST")).toBeVisible();
  await expect(basic.getByText("₹3,539 per month with 18% GST")).toBeVisible();

  const total = page.locator("aside").getByText("Total with GST").locator("..");
  await expect(total).toBeVisible();
  const before = await total.innerText();
  await page.getByRole("checkbox", { name: /AI Assistant/ }).click();
  await expect(total).not.toHaveText(before);
  await expect(total).toContainText("₹");
});

test("a school signs up on a trial and lands on its dashboard", async ({ page }) => {
  const slug = unique("e2e-trial-");
  await page.goto("/signup?plan=basic&cycle=monthly");
  await expect(page.getByRole("button", { name: "Create my school" })).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByRole("radio", { name: /Basic/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("School name").fill(`E2E Trial ${slug}`);
  await page.getByLabel("School ID").fill(slug);
  await page.getByLabel("Your name").fill("Trial Admin");
  const email = `admin+${slug}@example.com`; // example.com is never really emailed
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Trial12345");
  await page.getByRole("checkbox").click();
  const created = page.waitForResponse((r) => r.url().endsWith("/public/signup") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Create my school" }).click();
  const { data } = await (await created).json();
  test.skip(!data?.debug_code, "The API isn't running with OTP_DEBUG, so the emailed code can't be read here.");

  // The school opens only once the emailed code is entered.
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  const code = page.getByLabel("Confirmation code");
  await code.fill(data.debug_code === "000000" ? "111111" : "000000"); // a wrong code is checked as soon as it's complete
  await expect(page.locator("#signup-details").getByRole("alert")).toContainText("wrong or has expired");
  await code.fill(data.debug_code);

  await expect(page).toHaveURL(/\/dashboard\?welcome=1/, { timeout: 30_000 });
  await expect(page.getByText("Your school is ready!")).toBeVisible();
  await expect(page.getByText(/days left in your free trial/)).toBeVisible();

  // Basic doesn't include exams: it shows as locked with the plan that unlocks it.
  await page.goto("/settings/modules");
  await expect(page.getByRole("switch", { name: "Examinations" })).toBeDisabled();
  await expect(page.getByText("Available on Pro").first()).toBeVisible();

  // During the trial the admin can try another plan for free.
  await page.goto("/settings/billing");
  const pro = page.locator("article").filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) });
  await pro.getByRole("button", { name: /Try it free until/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Switch plan" }).click();
  await expect(page.getByText("You're now on the Pro plan.")).toBeVisible();
  await page.goto("/settings/modules");
  await expect(page.getByRole("switch", { name: "Examinations" })).toBeEnabled();

  // Paying for the plan online: the price, 18% GST and the total, then an invoice. (Test payments: no money moves.)
  await page.goto("/settings/billing");
  await page.getByRole("radio", { name: /Monthly/ }).click();
  await page.getByRole("button", { name: /Pay and activate Pro/ }).click();
  const checkout = page.getByRole("dialog");
  await expect(checkout.getByText("GST (18%)")).toBeVisible();
  const totalText = (await checkout.getByRole("button", { name: /^Pay ₹/ }).textContent())!.replace("Pay ", "").trim();
  await checkout.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page.getByText("Payment received. You're on the Pro plan.")).toBeVisible();
  const invoice = page.getByRole("table", { name: "Subscription payments" }).getByRole("row").nth(1);
  await expect(invoice).toContainText("VNX-");
  await expect(invoice).toContainText(totalText);
  await expect(page.getByText(/Paid until/)).toBeVisible();
});

test("contact form enquiries reach the platform admin", async ({ page, browser }) => {
  const name = `E2E Lead ${unique("")}`;
  await page.goto("/contact?students=900&modules=fees,transport");
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled({ timeout: 20_000 });
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill("lead@school.edu");
  await expect(page.getByLabel("How can we help?")).toHaveValue(/fees, transport/);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thanks — we've got your message")).toBeVisible();

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await login(admin, DEMO.superAdmin.email, DEMO.superAdmin.password, null);
  await expect(admin).toHaveURL(/\/dashboard/);
  await admin.goto("/platform/leads");
  const row = admin.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("900 students");
  await ctx.close();
});

test("someone who never entered the sign-up code is asked for it when they sign in", async ({ page, request }) => {
  const slug = unique("e2e-unconfirmed-");
  const email = `owner+${slug}@example.com`;
  const res = await request.post("/api/proxy/public/signup", { data: {
    school_name: `Unconfirmed ${slug}`, school_slug: slug, full_name: "Pat Owner", email, password: "Unconfirmed1",
    plan_code: "basic", billing_cycle: "monthly", accept_terms: true,
  } });
  expect(res.status()).toBe(201);

  await page.goto("/login");
  await page.getByLabel("School ID").fill(slug);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("Unconfirmed1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expect(page.getByText(`A new code is on its way to ${email}`)).toBeVisible(); // a fresh one: the first may have expired
});
