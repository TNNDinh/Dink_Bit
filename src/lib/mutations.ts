import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, today } from "@/lib/security";
import { activeWhere, serializeDebt, serializable } from "@/lib/book";
import { contactSchema, dateSchema, debtSchema, paymentSchema } from "@/lib/validation";
import { checkPayment } from "@/lib/domain";

export async function mutateBook(userId: string, action: string, input: unknown, transactionClient?: Prisma.TransactionClient) {
  const database = transactionClient ?? db;
  const runTransaction = <Result>(operation: (transaction: Prisma.TransactionClient) => Promise<Result>) => transactionClient ? operation(transactionClient) : serializable(operation);
  if (action === "contact.create" || action === "contact.update") {
    const data = contactSchema.parse(input);
    if (action === "contact.create") return database.contact.create({ data: { ...data, userId } });
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    return database.contact.update({ where: { id, userId }, data });
  }
  if (action === "contact.delete") {
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    await database.contact.delete({ where: { id, userId } });
    return { success: true };
  }
  if (action === "debt.create" || action === "debt.update") {
    const data = debtSchema.parse(input);
    if (data.createdDate > today()) throw new ApiError("Ngày tạo không được ở tương lai.");
    const id = action === "debt.update" ? z.object({ id: z.string().min(1) }).parse(input).id : undefined;
    return runTransaction(async (transaction) => {
      if (!await transaction.contact.findFirst({ where: { id: data.contactId, userId } })) throw new ApiError("Người liên hệ không hợp lệ.");
      const existing = id ? await transaction.debt.findFirst({ where: { id, userId }, include: { transactions: { orderBy: { transactionDate: "asc" }, take: 1 } } }) : null;
      if (id && !existing) throw new ApiError("Không tìm thấy công nợ.", 404);
      if (existing?.cancelled) throw new ApiError("Không thể sửa công nợ đã đóng.");
      if (existing && BigInt(data.totalAmount) < existing.paidAmount) throw new ApiError("Tổng tiền không được thấp hơn số đã thanh toán.");
      const ledger = await transaction.debt.aggregate({ where: { userId }, _sum: { totalAmount: true } });
      if ((ledger._sum.totalAmount ?? 0n) - (existing?.totalAmount ?? 0n) + BigInt(data.totalAmount) > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError("Tổng sổ công nợ vượt giới hạn số nguyên an toàn của ứng dụng.");
      if (existing?.transactions.length && (data.type !== existing.type || data.contactId !== existing.contactId)) throw new ApiError("Không thể đổi người hoặc loại khi đã có thanh toán.");
      if (existing?.transactions[0] && data.createdDate > existing.transactions[0].transactionDate.toISOString().slice(0, 10)) throw new ApiError("Ngày tạo phải trước hoặc bằng ngày thanh toán đầu tiên.");
      const values = { ...data, title: data.title || "Khoản công nợ", totalAmount: BigInt(data.totalAmount), createdDate: new Date(data.createdDate), dueDate: data.dueDate ? new Date(data.dueDate) : null };
      const debt = id ? await transaction.debt.update({ where: { id, userId }, data: values }) : await transaction.debt.create({ data: { ...values, userId } });
      await transaction.activity.create({ data: { debtId: debt.id, kind: id ? "EDIT" : "CREATE", message: id ? "Cập nhật thông tin công nợ" : "Tạo khoản công nợ", amount: debt.totalAmount } });
      if (!id) await transaction.notification.create({ data: { userId, debtId: debt.id, type: "DEBT_CREATED", title: "Công nợ mới", message: debt.title } });
      return serializeDebt(debt);
    });
  }
  if (action === "payment.create") {
    const data = paymentSchema.parse(input);
    return runTransaction(async (transaction) => {
      const prior = await transaction.transaction.findUnique({ where: { requestId: data.requestId } });
      if (prior) {
        if (prior.userId !== userId || prior.debtId !== data.debtId || prior.amount !== BigInt(data.amount) || prior.paymentMethod !== data.paymentMethod || prior.note !== data.note || prior.transactionDate.toISOString().slice(0, 10) !== data.transactionDate) throw new ApiError("Mã yêu cầu đã được dùng cho giao dịch khác.", 409);
        return prior;
      }
      const debt = await transaction.debt.findFirst({ where: { id: data.debtId, userId }, include: { contact: true } });
      if (!debt || debt.cancelled) throw new ApiError("Công nợ không tồn tại hoặc đã đóng.", 404);
      if (data.transactionDate < debt.createdDate.toISOString().slice(0, 10) || data.transactionDate > today()) throw new ApiError("Ngày thanh toán phải từ ngày tạo đến ngày hiện tại.");
      let paidAmount: bigint;
      try { paidAmount = checkPayment(debt.totalAmount, debt.paidAmount, BigInt(data.amount)); } catch (error) { throw new ApiError((error as Error).message); }
      await transaction.debt.update({ where: { id: debt.id, userId }, data: { paidAmount } });
      const payment = await transaction.transaction.create({ data: { ...data, amount: BigInt(data.amount), userId, contactId: debt.contactId, type: debt.type, transactionDate: new Date(data.transactionDate) } });
      await transaction.activity.create({ data: { debtId: debt.id, kind: "PAYMENT", message: `${debt.contact.name} · Ghi nhận thanh toán`, amount: BigInt(data.amount) } });
      await transaction.notification.create({ data: { userId, debtId: debt.id, type: paidAmount === debt.totalAmount ? "PAID" : "PAYMENT", title: paidAmount === debt.totalAmount ? "Công nợ đã thanh toán hết" : "Thanh toán mới", message: `${debt.contact.name} · ${debt.title}` } });
      if (paidAmount === debt.totalAmount) await transaction.reminder.updateMany({ where: { debtId: debt.id, userId }, data: { completed: true } });
      return payment;
    });
  }
  if (["debt.note", "debt.close", "debt.delete"].includes(action)) {
    const { id, note } = z.object({ id: z.string().min(1), note: z.string().trim().max(2000).optional() }).parse(input);
    await runTransaction(async (transaction) => {
      const debt = await transaction.debt.findFirst({ where: { id, userId }, include: { _count: { select: { transactions: true, attachments: true } } } });
      if (!debt) throw new ApiError("Không tìm thấy công nợ.", 404);
      if (action === "debt.delete") {
        if (debt._count.transactions || debt._count.attachments) throw new ApiError("Khoản có thanh toán hoặc đính kèm không được xóa. Hãy đóng công nợ để giữ lịch sử.");
        await transaction.notification.deleteMany({ where: { userId, debtId: id } });
        await transaction.debt.delete({ where: { id, userId } });
      } else if (action === "debt.close") {
        await transaction.debt.update({ where: { id, userId }, data: { cancelled: true } });
        await transaction.reminder.updateMany({ where: { debtId: id, userId }, data: { completed: true } });
        await transaction.activity.create({ data: { debtId: id, kind: "CLOSE", message: "Đóng công nợ; không ghi nhận thanh toán" } });
      } else {
        if (!note) throw new ApiError("Nhập nội dung ghi chú.");
        await transaction.activity.create({ data: { debtId: id, kind: "NOTE", message: note } });
      }
    });
    return { success: true };
  }
  if (action === "reminder.create") {
    const data = z.object({ debtId: z.string().min(1), reminderDate: dateSchema }).parse(input);
    if (data.reminderDate < today()) throw new ApiError("Ngày nhắc không được ở quá khứ.");
    const debt = await database.debt.findFirst({ where: { id: data.debtId, userId, ...activeWhere() } });
    if (!debt) throw new ApiError("Công nợ không hợp lệ.", 404);
    return database.reminder.upsert({ where: { debtId_reminderDate: { debtId: debt.id, reminderDate: new Date(data.reminderDate) } }, update: { completed: false }, create: { ...data, userId, reminderDate: new Date(data.reminderDate) } });
  }
  if (action === "notifications.read") {
    const { id } = z.object({ id: z.string().optional() }).parse(input);
    await database.notification.updateMany({ where: { userId, ...(id ? { id } : {}) }, data: { read: true } });
    return { success: true };
  }
  if (action === "settings.update") {
    const data = z.object({ name: z.string().trim().min(1).max(100), reminderDays: z.union([z.literal(1), z.literal(3), z.literal(7)]) }).parse(input);
    await database.user.update({ where: { id: userId }, data });
    return { success: true };
  }
  throw new ApiError("Thao tác không tồn tại.", 404);
}
