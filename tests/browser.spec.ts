import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

test("Admin: đăng nhập, thêm tài khoản, responsive", async ({ page }) => {
  test.setTimeout(120000);
  const db = new PrismaClient(), email = `browser-admin-${randomUUID()}@example.com`;
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(process.env.ADMIN_EMAIL || "tranngocnguyendinh@gmail.com");
    await page.getByLabel("Mật khẩu", { exact: true }).fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Chào", { timeout: 60000 });
    await page.getByRole("link", { name: "Quản trị", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quản trị tài khoản", exact: true })).toBeVisible();
    await page.getByLabel("Họ và tên", { exact: true }).fill("Người dùng mới");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserPassword@2026");
    await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveValue("");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: ".local/admin-mobile.png", fullPage: true });
    expect((await db.user.findUniqueOrThrow({ where: { email } })).role).toBe("USER");
  } finally { await db.user.deleteMany({ where: { email } }); await db.$disconnect(); }
});

test("Dashboard demo: desktop, mobile, dark mode, điều hướng", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await expect(page).toHaveTitle("DinkBit — Công nợ rõ ràng, cuộc sống nhẹ nhàng");
  await expect(page.locator(".auth-brand .logo")).toContainText("DinkBit");
  await page.getByLabel("Email", { exact: true }).fill(process.env.SEED_EMAIL || "demo@debtbook.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(process.env.SEED_PASSWORD || "DebtBook@2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Chào");
  await expect(page.locator(".summary-card")).toHaveCount(4);
  await expect(page.locator(".sidebar .logo")).toContainText("DinkBit");
  await expect(page.locator(".content-footer")).toContainText("DinkBit");
  await expect(page.getByRole("link", { name: "Quản trị", exact: true })).toHaveCount(0);
  await expect(page.locator(".balance-chart svg").first()).toBeVisible();
  await expect(page.locator(".donut-chart .recharts-pie-sector").first()).toBeVisible();
  mkdirSync(".local", { recursive: true });
  await page.screenshot({ path: ".local/dashboard-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Bật giao diện tối" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: ".local/dashboard-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Bật giao diện sáng" }).click();
  await page.getByRole("button", { name: "Thêm công nợ", exact: true }).click();
  const contactDialog = page.getByRole("dialog"), contactSelect = contactDialog.getByLabel("Người liên hệ *", { exact: true });
  const selected = await contactSelect.selectOption({ label: "Nguyễn Văn An" });
  await contactDialog.getByLabel("Tìm người liên hệ", { exact: true }).fill("không có tên này");
  await expect(contactSelect.locator("option")).toHaveCount(2);
  await expect(contactSelect).toHaveValue(selected[0]);
  await contactDialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-navigation")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/dashboard-mobile.png", fullPage: true });
  await page.locator(".mobile-navigation").getByRole("link", { name: "Công nợ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Công nợ", exact: true })).toBeVisible();
  await expect(page.locator(".mobile-debts .debt-card").first()).toBeVisible();
  for (const route of ["/contacts", "/transactions", "/reports", "/reminders", "/settings"]) {
    await page.goto(route); await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await expect(page.getByText("Chưa thể tải dữ liệu", { exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("UI thật: đăng ký → thêm người/công nợ → thanh toán → tải lại", async ({ page }) => {
  const email = `ui-${randomUUID()}@example.com`, db = new PrismaClient();
  try {
    await page.goto("/register");
    await page.getByLabel("Họ và tên", { exact: true }).fill("Người UI");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("UIpassword@2026");
    await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("UIpassword@2026");
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("UIpassword@2026");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.locator("h1")).toContainText("Chào");
    await page.getByRole("button", { name: "Thêm công nợ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lưu công nợ" }).click();
    await expect(dialog.getByText("Chọn người liên hệ.", { exact: true })).toBeVisible();
    await dialog.getByLabel("Tên người liên hệ mới").fill("Nguyễn UI");
    await dialog.getByRole("button", { name: "Thêm", exact: true }).click();
    await expect(dialog.getByLabel("Người liên hệ *", { exact: true })).not.toHaveValue("");
    await dialog.getByLabel("Số tiền *", { exact: true }).fill("1.5");
    await expect(dialog.getByText("Chỉ nhập số nguyên VND, không nhập dấu trừ hoặc phần thập phân.")).toBeVisible();
    await dialog.getByLabel("Số tiền *", { exact: true }).fill("1000000");
    await dialog.getByLabel("Nội dung", { exact: true }).fill("Khoản vay UI");
    await dialog.getByRole("button", { name: "Lưu công nợ" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("link", { name: "Nguyễn UI Khoản vay UI" }).first().click();
    await expect(page.getByRole("heading", { name: "Khoản vay UI", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ghi nhận thanh toán", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xác nhận thanh toán" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".debt-detail .badge")).toHaveText("Đã thanh toán");
    const debtUrl = page.url();
    await page.goto("/settings");
    const integrations = page.getByRole("region", { name: "Kết nối AI & API" });
    await expect(integrations.getByLabel("Quyền truy cập")).toHaveValue("READ");
    await integrations.getByLabel("Tên kết nối AI").fill("Trợ lý kiểm thử");
    await integrations.getByRole("button", { name: "Tạo token AI", exact: true }).click();
    const tokenDialog = page.getByRole("dialog", { name: "Lưu token AI của bạn" });
    const token = await tokenDialog.getByLabel("Token API (chỉ hiển thị một lần)").inputValue();
    expect(token).toMatch(/^dinkbit_[a-f0-9]{64}$/);
    expect((await page.request.get("/api/ai?resource=debts", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
    expect((await page.request.post("/api/ai", { headers: { Authorization: `Bearer ${token}` }, data: { action: "contact.create", requestId: randomUUID(), data: { name: "Bị chặn" } } })).status()).toBe(403);
    await tokenDialog.getByRole("button", { name: "Đã lưu token", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(integrations.getByText("Trợ lý kiểm thử", { exact: true })).toBeVisible();
    await integrations.getByRole("button", { name: "Thu hồi Trợ lý kiểm thử" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Thu hồi token", exact: true }).click();
    await expect(integrations.getByText(/Đã thu hồi/)).toBeVisible();
    expect((await page.request.get("/api/ai", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: ".local/integrations-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(debtUrl);
    await page.reload();
    await expect(page.locator(".detail-balance>strong")).toContainText("0");
    await expect(page.locator(".debt-detail .badge")).toHaveText("Đã thanh toán");
  } finally {
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      await db.transaction.deleteMany({ where: { userId: user.id } });
      await db.debt.deleteMany({ where: { userId: user.id } });
      await db.contact.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  }
});
