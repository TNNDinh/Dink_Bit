import { test } from "node:test";
import assert from "node:assert/strict";
import { debtStatus, checkPayment, csvCell } from "../src/lib/domain";
import { amountSchema, dateSchema, debtSchema } from "../src/lib/validation";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { dateLabel } from "../src/lib/utils";
const base = { totalAmount: 1000n, paidAmount: 0n, cancelled: false, dueDate: null };
test("Ngày hiển thị đủ dd/MM/yyyy và nhãn chart không cắt vào năm", () => {
  assert.equal(dateLabel("2026-10-06"), "06/10/2026");
  assert.equal(dateLabel("2026-09-07").slice(0, 5), "07/09");
  assert.equal(dateLabel(null), "Không có hạn");
});
test("Trạng thái công nợ và thứ tự ưu tiên", () => {
  assert.equal(debtStatus(base, "2026-10-06"), "ACTIVE");
  assert.equal(debtStatus({ ...base, paidAmount: 100n }, "2026-10-06"), "PARTIALLY_PAID");
  assert.equal(debtStatus({ ...base, dueDate: "2026-10-05" }, "2026-10-06"), "OVERDUE");
  assert.equal(debtStatus({ ...base, dueDate: "2026-10-06" }, "2026-10-06"), "ACTIVE");
  assert.equal(debtStatus({ ...base, paidAmount: 1000n, dueDate: "2026-10-05" }, "2026-10-06"), "PAID");
  assert.equal(debtStatus({ ...base, cancelled: true, paidAmount: 1000n }, "2026-10-06"), "CANCELLED");
});
test("Thanh toán chính xác bằng số nguyên và chặn vượt dư", () => {
  assert.equal(checkPayment(1000n, 200n, 300n), 500n);
  assert.equal(checkPayment(1000n, 200n, 800n), 1000n);
  assert.throws(() => checkPayment(1000n, 200n, 801n));
  assert.throws(() => checkPayment(1000n, 200n, 0n));
  assert.throws(() => checkPayment(1000n, 200n, -1n));
});
test("Validation số tiền, ngày và liên hệ", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, 1e13]) assert.equal(amountSchema.safeParse(value).success, false);
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
  assert.equal(dateSchema.safeParse("2024-02-29").success, true);
  assert.equal(debtSchema.safeParse({ contactId: "", type: "RECEIVABLE", totalAmount: 1000, createdDate: "2026-10-06" }).success, false);
  assert.equal(debtSchema.safeParse({ contactId: "contact", type: "RECEIVABLE", totalAmount: 1000, createdDate: "2026-10-06", dueDate: "2026-10-05" }).success, false);
});
test("CSV escape và ngăn công thức spreadsheet", () => {
  assert.equal(csvCell('An "A"'), '"An ""A"""');
  assert.equal(csvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
  assert.equal(csvCell(123), '"123"');
});
test("Mật khẩu dùng salt ngẫu nhiên, so sánh an toàn", async () => {
  const first = await hashPassword("DebtBook@2026"), second = await hashPassword("DebtBook@2026");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("DebtBook@2026", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
});
