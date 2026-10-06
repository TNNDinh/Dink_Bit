import { Prisma, type Debt } from "@prisma/client";
import { db } from "@/lib/db";
import { debtStatus } from "@/lib/domain";
import { ApiError, today } from "@/lib/security";
import { dateSchema } from "@/lib/validation";

export const activeWhere = () => ({ cancelled: false, paidAmount: { lt: db.debt.fields.totalAmount } });
export const debtInclude = { contact: { select: { id: true, name: true, phone: true, email: true } } } satisfies Prisma.DebtInclude;
export function serializeDebt<T extends Debt>(debt: T) {
  return { ...debt, remainingAmount: debt.totalAmount - debt.paidAmount, status: debtStatus(debt, today()) };
}
export async function ownedDebt(userId: string, id: string) {
  const debt = await db.debt.findFirst({ where: { id, userId }, include: { ...debtInclude, transactions: { orderBy: { transactionDate: "desc" } }, activities: { orderBy: { createdAt: "desc" } }, attachments: { select: { id: true, fileName: true, fileType: true, size: true } } } });
  if (!debt) throw new ApiError("Không tìm thấy công nợ.", 404);
  return serializeDebt(debt);
}
export function debtFilters(userId: string, params: URLSearchParams): Prisma.DebtWhereInput {
  const clauses: Prisma.DebtWhereInput[] = [{ userId }];
  const query = params.get("q")?.trim().slice(0, 200);
  if (query) clauses.push({ OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { contact: { name: { contains: query, mode: "insensitive" } } }] });
  const type = params.get("type");
  if (type === "RECEIVABLE" || type === "PAYABLE") clauses.push({ type });
  const status = params.get("status"), now = new Date(today());
  if (status === "OVERDUE") clauses.push({ ...activeWhere(), dueDate: { lt: now } });
  if (status === "PAID") clauses.push({ cancelled: false, paidAmount: { equals: db.debt.fields.totalAmount } });
  if (status === "CANCELLED") clauses.push({ cancelled: true });
  if (status === "ACTIVE") clauses.push({ cancelled: false, paidAmount: 0, OR: [{ dueDate: null }, { dueDate: { gte: now } }] });
  if (status === "PARTIALLY_PAID") clauses.push({ ...activeWhere(), paidAmount: { gt: 0, lt: db.debt.fields.totalAmount }, OR: [{ dueDate: null }, { dueDate: { gte: now } }] });
  if (params.get("contactId")) clauses.push({ contactId: params.get("contactId")! });
  const from = params.get("from"), to = params.get("to");
  if (from || to) {
    for (const value of [from, to]) if (value && !dateSchema.safeParse(value).success) throw new ApiError("Ngày lọc không hợp lệ.");
    if (from && to && from > to) throw new ApiError("Ngày bắt đầu phải trước ngày kết thúc.");
    clauses.push({ createdDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } });
  }
  const min = params.get("min"), max = params.get("max");
  if (min || max) {
    if ([min, max].some((value) => value && (!/^\d{1,13}$/.test(value) || Number(value) > 1e12))) throw new ApiError("Số tiền lọc không hợp lệ.");
    clauses.push({ totalAmount: { ...(min ? { gte: BigInt(min) } : {}), ...(max ? { lte: BigInt(max) } : {}) } });
  }
  return { AND: clauses };
}
export async function summary(userId: string) {
  const balances = await db.$queryRaw<{ type: string; remaining: bigint; total: bigint; paid: bigint; people: bigint }[]>`
    SELECT "type", SUM("totalAmount" - "paidAmount") AS remaining, SUM("totalAmount") AS total,
    SUM("paidAmount") AS paid, COUNT(DISTINCT "contactId") FILTER (WHERE "totalAmount" > "paidAmount") AS people
    FROM "Debt" WHERE "userId" = ${userId} AND NOT cancelled GROUP BY "type"`;
  const overdue = await db.debt.aggregate({ where: { userId, ...activeWhere(), dueDate: { lt: new Date(today()) } }, _sum: { totalAmount: true, paidAmount: true }, _count: true });
  const receivable = balances.find((row) => row.type === "RECEIVABLE"), payable = balances.find((row) => row.type === "PAYABLE");
  return { receivable: Number(receivable?.remaining ?? 0), payable: Number(payable?.remaining ?? 0), receivablePeople: Number(receivable?.people ?? 0), payablePeople: Number(payable?.people ?? 0), overdue: Number((overdue._sum.totalAmount ?? 0n) - (overdue._sum.paidAmount ?? 0n)), overdueCount: overdue._count, collected: Number(receivable?.paid ?? 0), repaid: Number(payable?.paid ?? 0), lent: Number(receivable?.total ?? 0), borrowed: Number(payable?.total ?? 0) };
}
export function chartRange(params: URLSearchParams) {
  const end = new Date(today()), days = Math.min(366, Math.max(7, Number(params.get("days")) || 30));
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1);
  if (params.get("from") && params.get("to")) {
    const from = new Date(dateSchema.parse(params.get("from"))), to = new Date(dateSchema.parse(params.get("to")));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to > end || (to.getTime() - from.getTime()) / 86400000 > 366) throw new ApiError("Khoảng thời gian tối đa 1 năm và không vượt ngày hiện tại.");
    return { start: from, end: to };
  }
  return { start, end };
}
export async function chart(userId: string, params: URLSearchParams) {
  const { start, end } = chartRange(params);
  const events = await db.$queryRaw<{ day: Date; type: string; amount: bigint }[]>`
    SELECT day, "type", SUM(amount) AS amount FROM (
      SELECT "createdDate" AS day, "type", "totalAmount" AS amount FROM "Debt" WHERE "userId" = ${userId} AND NOT cancelled AND "createdDate" <= ${end}
      UNION ALL
      SELECT t."transactionDate" AS day, t."type", -t.amount AS amount FROM "Transaction" t JOIN "Debt" d ON d.id = t."debtId"
      WHERE t."userId" = ${userId} AND NOT d.cancelled AND t."transactionDate" <= ${end}
    ) events GROUP BY day, "type" ORDER BY day`;
  const points: { date: string; receivable: number; payable: number }[] = [];
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1, step = Math.max(1, Math.ceil(totalDays / 12));
  let eventIndex = 0, receivable = 0, payable = 0;
  for (let offset = 0; offset < totalDays; offset++) {
    const point = new Date(start); point.setUTCDate(point.getUTCDate() + offset);
    while (eventIndex < events.length && events[eventIndex].day <= point) {
      const event = events[eventIndex++];
      if (event.type === "RECEIVABLE") receivable += Number(event.amount); else payable += Number(event.amount);
    }
    if (offset % step === 0 || offset === totalDays - 1) points.push({ date: point.toISOString().slice(0, 10), receivable, payable });
  }
  const cashflow = await db.transaction.groupBy({ by: ["type"], where: { userId, transactionDate: { gte: start, lte: end } }, _sum: { amount: true } });
  return { points, cashflow: { collected: Number(cashflow.find((row) => row.type === "RECEIVABLE")?._sum.amount ?? 0), repaid: Number(cashflow.find((row) => row.type === "PAYABLE")?._sum.amount ?? 0) } };
}
export async function serializable<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new ApiError("Dữ liệu vừa thay đổi. Vui lòng thử lại.", 409);
}
