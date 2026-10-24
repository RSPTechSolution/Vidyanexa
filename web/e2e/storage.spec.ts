import { expect, test } from "./fixtures";
import { DEMO, login, loginAsAdmin, unique } from "./helpers";

test("the admin sees how much storage is used and left, finds a file and deletes it", async ({ page }) => {
  await loginAsAdmin(page);
  // A document uploaded to a student's profile, as the office would.
  const student = (await (await page.request.get("/api/proxy/students?page_size=1")).json()).data[0];
  const name = `${unique("old-circular-")}.txt`;
  const up = await page.request.post("/api/proxy/files", {
    multipart: { purpose: "student_document", owner_id: student.id, file: { name, mimeType: "text/plain", buffer: Buffer.from("x".repeat(5000)) } },
  });
  expect(up.ok(), await up.text()).toBeTruthy();

  await page.goto("/settings/storage");
  await expect(page.getByRole("heading", { name: "Storage", level: 1 })).toBeVisible();
  await expect(page.getByText(/of \d+ GB used/)).toBeVisible();
  await expect(page.getByText(/ free$/).first()).toBeVisible();

  await page.getByRole("textbox", { name: "Search files" }).fill(name.replace(".txt", ""));
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`${student.first_name} ${student.last_name}`); // who it belongs to

  await row.getByRole("button", { name: `Delete ${name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("can't be recovered");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/Deleted 1 file · .* freed/)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("teachers can't open the storage page", async ({ page }) => {
  await login(page, DEMO.teacher, DEMO.password);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings/storage");
  await expect(page.getByText(/of \d+ GB used/)).toHaveCount(0);
});
