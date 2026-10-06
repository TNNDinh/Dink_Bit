import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { debtFilters, debtInclude, ownedDebt, serializable, serializeDebt, summary } from "@/lib/book";
import { mutateBook } from "@/lib/mutations";
import { ApiError, json, readJson } from "@/lib/security";
import { aiQuerySchema, aiWriteSchema, integrationError, integrationUser } from "@/lib/integrations";

export async function GET(request: Request) {
  try {
    const key = await integrationUser(request, "READ"), params = new URL(request.url).searchParams;
    const query = aiQuerySchema.parse(Object.fromEntries(params));
    if (query.resource === "overview") return json({ totals: await summary(key.userId) });
    if (query.resource === "debt") {
      if (!query.id) throw new ApiError("resource=debt cần id.");
      return json(await ownedDebt(key.userId, query.id));
    }
    if (query.resource === "contact") {
      if (!query.id) throw new ApiError("resource=contact cần id.");
      const contact = await db.contact.findFirst({ where: { id: query.id, userId: key.userId } });
      if (!contact) throw new ApiError("Không tìm thấy người liên hệ.", 404);
      return json(contact);
    }
    const { page, pageSize } = query;
    if (query.resource === "contacts") {
      const where = { userId: key.userId, ...(query.q ? { name: { contains: query.q, mode: Prisma.QueryMode.insensitive } } : {}) };
      const [items, count] = await db.$transaction([db.contact.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }), db.contact.count({ where })]);
      return json({ items, count, page, pageSize });
    }
    const where = debtFilters(key.userId, params);
    const [items, count] = await db.$transaction([db.debt.findMany({ where, include: debtInclude, orderBy: [{ createdDate: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }), db.debt.count({ where })]);
    return json({ items: items.map(serializeDebt), count, page, pageSize });
  } catch (error) { return integrationError(error); }
}
export async function POST(request: Request) {
  try {
    const key = await integrationUser(request, "WRITE");
    const input = aiWriteSchema.parse(await readJson(request));
    const inputHash = createHash("sha256").update(JSON.stringify({ action: input.action, data: input.data })).digest("hex");
    const perform = () => serializable(async (transaction) => {
      const active = await transaction.integrationKey.findFirst({ where: { id: key.id, userId: key.userId, revokedAt: null, expiresAt: { gt: new Date() }, scopes: { has: "WRITE" }, user: { sessionVersion: key.sessionVersion } } });
      if (!active) throw new ApiError("Token đã hết hạn hoặc bị thu hồi.", 401);
      const previous = await transaction.integrationRequest.findUnique({ where: { keyId_requestId: { keyId: key.id, requestId: input.requestId } } });
      if (previous) {
        if (previous.inputHash !== inputHash) throw new ApiError("requestId đã được dùng với dữ liệu khác.", 409);
        return previous.response;
      }
      const result = await mutateBook(key.userId, input.action, input.data, transaction);
      const payload = JSON.parse(JSON.stringify({ requestId: input.requestId, result }, (_, value) => typeof value === "bigint" ? Number(value) : value)) as Prisma.InputJsonObject;
      await transaction.integrationRequest.create({ data: { keyId: key.id, requestId: input.requestId, inputHash, response: payload } });
      return payload;
    });
    try { return json(await perform()); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const previous = await db.integrationRequest.findUnique({ where: { keyId_requestId: { keyId: key.id, requestId: input.requestId } } });
      if (!previous) throw error;
      if (previous.inputHash !== inputHash) throw new ApiError("requestId đã được dùng với dữ liệu khác.", 409);
      return json(previous.response);
    }
  } catch (error) { return integrationError(error); }
}
