export type DebtStatus = "ACTIVE" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export const statuses: Record<DebtStatus, string> = { ACTIVE: "Đang nợ", PARTIALLY_PAID: "Trả một phần", PAID: "Đã thanh toán", OVERDUE: "Quá hạn", CANCELLED: "Đã đóng" };
export const methods: Record<string, string> = { CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản", E_WALLET: "Ví điện tử", OTHER: "Khác" };
export function debtStatus(debt: { totalAmount: number | bigint; paidAmount: number | bigint; dueDate: Date | string | null; cancelled: boolean }, today: string): DebtStatus {
  if (debt.cancelled) return "CANCELLED";
  if (debt.paidAmount >= debt.totalAmount) return "PAID";
  if (debt.dueDate && new Date(debt.dueDate).toISOString().slice(0, 10) < today) return "OVERDUE";
  if (debt.paidAmount > 0) return "PARTIALLY_PAID";
  return "ACTIVE";
}
export function checkPayment(total: bigint, paid: bigint, amount: bigint) {
  if (amount <= 0n) throw new Error("Số tiền phải lớn hơn 0.");
  if (amount > total - paid) throw new Error("Số tiền vượt quá công nợ còn lại.");
  return paid + amount;
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
