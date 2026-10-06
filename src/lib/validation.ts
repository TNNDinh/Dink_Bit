import { z } from "zod";
export const amountSchema = z.number().int("Số tiền phải là số nguyên VND.").min(1, "Số tiền phải lớn hơn 0.").max(1_000_000_000_000, "Số tiền tối đa là 1.000 tỷ đồng.");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ.").refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= "2200-12-31";
}, "Ngày không hợp lệ.");
const text = (length = 2000) => z.string().trim().max(length);
export const contactSchema = z.object({ name: text(100).min(1, "Nhập tên người liên hệ."), phone: text(30).default(""), email: z.union([z.email("Email không hợp lệ."), z.literal("")]).default(""), note: text().default("") });
export const debtSchema = z.object({
  contactId: z.string().min(1, "Chọn người liên hệ."), type: z.enum(["RECEIVABLE", "PAYABLE"]),
  totalAmount: amountSchema, title: text(200).default(""), description: text().default(""),
  createdDate: dateSchema, dueDate: z.union([dateSchema, z.literal("")]).default(""), note: text().default(""),
}).refine((value) => !value.dueDate || value.dueDate >= value.createdDate, { path: ["dueDate"], message: "Hạn thanh toán không được trước ngày tạo." });
export const paymentSchema = z.object({ debtId: z.string().min(1), amount: amountSchema, transactionDate: dateSchema, paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "E_WALLET", "OTHER"]), note: text().default(""), requestId: z.uuid() });
export const registrationSchema = z.object({ name: text(100).min(1, "Nhập tên của bạn."), email: z.email().transform((value) => value.toLowerCase()), password: z.string().min(10, "Mật khẩu cần ít nhất 10 ký tự.").max(128) });
