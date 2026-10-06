import { db } from "@/lib/db";
import { activeWhere } from "@/lib/book";
import { today } from "@/lib/security";
import { money } from "@/lib/utils";
export async function processReminders(userId: string, reminderDays: number) {
  const now = new Date(today()), boundary = new Date(now); boundary.setUTCDate(boundary.getUTCDate() + reminderDays);
  const debts = await db.debt.findMany({ where: { userId, ...activeWhere(), dueDate: { lte: boundary } }, include: { contact: true }, take: 1000 });
  for (const debt of debts) {
    const overdue = debt.dueDate! < now, type = overdue ? "OVERDUE" : "DUE_SOON";
    const dedupeKey = `${userId}:${debt.id}:${type}:${debt.dueDate!.toISOString().slice(0, 10)}:${Number(debt.totalAmount - debt.paidAmount)}`;
    await db.notification.createMany({ skipDuplicates: true, data: [{ userId, debtId: debt.id, dedupeKey, type, title: overdue ? "Công nợ đã quá hạn" : "Công nợ sắp đến hạn", message: `${debt.contact.name} · ${money(Number(debt.totalAmount - debt.paidAmount))}` }] });
  }
  const reminders = await db.reminder.findMany({ where: { userId, completed: false, reminderDate: { lte: now }, debt: activeWhere() }, include: { debt: { include: { contact: true } } }, take: 1000 });
  for (const reminder of reminders) {
    await db.$transaction([
      db.notification.createMany({ skipDuplicates: true, data: [{ userId, debtId: reminder.debtId, dedupeKey: `reminder:${reminder.id}`, type: "REMINDER", title: "Đến lịch nhắc thanh toán", message: `${reminder.debt.contact.name} · ${reminder.debt.title}` }] }),
      db.reminder.update({ where: { id: reminder.id }, data: { completed: true } }),
    ]);
  }
}
