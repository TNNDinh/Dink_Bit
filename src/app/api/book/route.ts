import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/current-user";
import { ApiError, checkOrigin, json, rateLimit, readJson, today } from "@/lib/security";
import { activeWhere, chart, debtFilters, debtInclude, ownedDebt, serializeDebt, summary } from "@/lib/book";
import { mutateBook } from "@/lib/mutations";
import { dateSchema } from "@/lib/validation";
import { processReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Dữ liệu không hợp lệ.", fields: z.flattenError(error).fieldErrors }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return json({ error: "Dữ liệu đã tồn tại hoặc yêu cầu đã được xử lý." }, 409);
    if (error.code === "P2025") return json({ error: "Không tìm thấy dữ liệu." }, 404);
    if (error.code === "P2003") return json({ error: "Không thể xóa dữ liệu đang có giao dịch liên quan." }, 409);
    if (error.code === "P2034") return json({ error: "Dữ liệu vừa thay đổi. Vui lòng thử lại." }, 409);
  }
  console.error("Book API", error);
  return json({ error: "Không thể xử lý yêu cầu. Kiểm tra kết nối và thử lại." }, 500);
}
export async function GET(request: Request) {
  try {
    const user = await currentUser(), params = new URL(request.url).searchParams;
    const resource = params.get("resource") || "overview";
    const page = Math.min(100000, Math.max(1, Math.floor(Number(params.get("page")) || 1))), pageSize = 12;
    if (resource === "overview" || resource === "reports") {
      const [totals, series, recent, due, top] = await Promise.all([
        summary(user.id), chart(user.id, params),
        db.debt.findMany({ where: { userId: user.id }, include: debtInclude, orderBy: { createdAt: "desc" }, take: 6 }),
        db.debt.findMany({ where: { userId: user.id, ...activeWhere(), dueDate: { lte: new Date(new Date(today()).getTime() + 7 * 86400000) } }, include: debtInclude, orderBy: { dueDate: "asc" }, take: 6 }),
        db.$queryRaw<{ id: string; name: string; remaining: bigint }[]>`SELECT c.id, c.name, SUM(d."totalAmount" - d."paidAmount") AS remaining FROM "Debt" d JOIN "Contact" c ON c.id = d."contactId" WHERE d."userId" = ${user.id} AND NOT d.cancelled AND d."type" = 'RECEIVABLE' GROUP BY c.id, c.name HAVING SUM(d."totalAmount" - d."paidAmount") > 0 ORDER BY remaining DESC LIMIT 5`,
      ]);
      return json({ totals, ...series, recent: recent.map(serializeDebt), due: due.map(serializeDebt), top: top.map((contact) => ({ ...contact, remaining: Number(contact.remaining) })) });
    }
    if (resource === "debts") {
      const where = debtFilters(user.id, params);
      const [items, count] = await db.$transaction([db.debt.findMany({ where, include: debtInclude, orderBy: params.get("sort") === "amount" ? { totalAmount: "desc" } : { createdDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), db.debt.count({ where })]);
      return json({ items: items.map(serializeDebt), count, page, pageSize });
    }
    if (resource === "debt") return json(await ownedDebt(user.id, params.get("id") || ""));
    if (resource === "contacts" || resource === "contact-options") {
      const where = { userId: user.id, ...(params.get("q") ? { name: { contains: params.get("q")!.slice(0, 100), mode: Prisma.QueryMode.insensitive } } : {}) };
      const [items, count] = await db.$transaction([db.contact.findMany({ where, include: { debts: { where: { cancelled: false }, select: { type: true, totalAmount: true, paidAmount: true } } }, orderBy: { name: "asc" }, take: resource === "contact-options" ? 50 : pageSize, skip: resource === "contact-options" ? 0 : (page - 1) * pageSize }), db.contact.count({ where })]);
      return json({ items: items.map(({ debts, ...contact }) => ({ ...contact, receivable: debts.filter((debt) => debt.type === "RECEIVABLE").reduce((sum, debt) => sum + Number(debt.totalAmount - debt.paidAmount), 0), payable: debts.filter((debt) => debt.type === "PAYABLE").reduce((sum, debt) => sum + Number(debt.totalAmount - debt.paidAmount), 0) })), count, page, pageSize });
    }
    if (resource === "contact") {
      const contact = await db.contact.findFirst({ where: { userId: user.id, id: params.get("id") || "" } });
      if (!contact) throw new ApiError("Không tìm thấy người liên hệ.", 404);
      const [totals, transactions] = await Promise.all([db.debt.groupBy({ by: ["type"], where: { userId: user.id, contactId: contact.id, cancelled: false }, _sum: { totalAmount: true, paidAmount: true } }), db.transaction.findMany({ where: { userId: user.id, contactId: contact.id }, orderBy: { transactionDate: "desc" }, take: 12, include: { debt: { select: { title: true } }, contact: { select: { name: true } } } })]);
      return json({ ...contact, receivable: Number((totals.find((row) => row.type === "RECEIVABLE")?._sum.totalAmount ?? 0n) - (totals.find((row) => row.type === "RECEIVABLE")?._sum.paidAmount ?? 0n)), payable: Number((totals.find((row) => row.type === "PAYABLE")?._sum.totalAmount ?? 0n) - (totals.find((row) => row.type === "PAYABLE")?._sum.paidAmount ?? 0n)), transactions });
    }
    if (resource === "transactions") {
      const where: Prisma.TransactionWhereInput = { userId: user.id };
      if (params.get("contactId")) where.contactId = params.get("contactId")!;
      if (["RECEIVABLE", "PAYABLE"].includes(params.get("type") || "")) where.type = params.get("type") as "RECEIVABLE" | "PAYABLE";
      if (["CASH", "BANK_TRANSFER", "E_WALLET", "OTHER"].includes(params.get("method") || "")) where.paymentMethod = params.get("method") as "CASH" | "BANK_TRANSFER" | "E_WALLET" | "OTHER";
      if (params.get("from") || params.get("to")) where.transactionDate = { ...(params.get("from") ? { gte: new Date(dateSchema.parse(params.get("from"))) } : {}), ...(params.get("to") ? { lte: new Date(dateSchema.parse(params.get("to"))) } : {}) };
      if (params.get("q")) where.OR = [{ note: { contains: params.get("q")!.slice(0, 200), mode: "insensitive" } }, { contact: { name: { contains: params.get("q")!.slice(0, 200), mode: "insensitive" } } }, { debt: { title: { contains: params.get("q")!.slice(0, 200), mode: "insensitive" } } }];
      const [items, count] = await db.$transaction([db.transaction.findMany({ where, include: { contact: { select: { name: true } }, debt: { select: { title: true } } }, orderBy: params.get("sort") === "amount" ? { amount: "desc" } : { transactionDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), db.transaction.count({ where })]);
      return json({ items, count, page, pageSize });
    }
    if (resource === "reminders") {
      const boundary = new Date(today()); boundary.setUTCDate(boundary.getUTCDate() + 7);
      const debts = await db.debt.findMany({ where: { userId: user.id, ...activeWhere(), dueDate: { lte: boundary } }, include: { ...debtInclude, reminders: { where: { completed: false }, orderBy: { reminderDate: "asc" } } }, orderBy: { dueDate: "asc" }, take: 100 });
      return json({ items: debts.map(serializeDebt), reminderDays: user.reminderDays });
    }
    if (resource === "notifications") {
      await processReminders(user.id, user.reminderDays);
      const [items, unread] = await Promise.all([db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }), db.notification.count({ where: { userId: user.id, read: false } })]);
      return json({ items, unread });
    }
    if (resource === "search") {
      const query = (params.get("q") || "").trim().slice(0, 100);
      if (query.length < 2) return json({ contacts: [], debts: [], transactions: [] });
      const contains = { contains: query, mode: Prisma.QueryMode.insensitive };
      const [contacts, debts, transactions] = await Promise.all([
        db.contact.findMany({ where: { userId: user.id, name: contains }, select: { id: true, name: true }, take: 5 }),
        db.debt.findMany({ where: { userId: user.id, OR: [{ title: contains }, { contact: { name: contains } }] }, include: debtInclude, take: 5 }),
        db.transaction.findMany({ where: { userId: user.id, OR: [{ note: contains }, { contact: { name: contains } }] }, include: { contact: { select: { name: true } } }, take: 5 }),
      ]);
      return json({ contacts, debts: debts.map(serializeDebt), transactions });
    }
    if (resource === "settings") return json(user);
    throw new ApiError("Trang dữ liệu không tồn tại.", 404);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    await rateLimit(`mutations:${user.id}`, 120, 60);
    const body = z.object({ action: z.string(), data: z.unknown() }).parse(await readJson(request));
    return json(await mutateBook(user.id, body.action, body.data));
  } catch (error) { return failure(error); }
}
