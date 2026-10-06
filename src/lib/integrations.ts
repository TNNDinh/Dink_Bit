import { createHash } from "node:crypto";
import { Prisma, type IntegrationScope } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, rateLimit } from "@/lib/security";
import { contactSchema, dateSchema, debtSchema } from "@/lib/validation";

export const keyInputSchema = z.object({ name: z.string().trim().min(1).max(60), access: z.enum(["READ", "READ_WRITE"]).default("READ"), expiresInDays: z.number().int().min(1).max(365).default(90) }).strict();
export const aiWriteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("contact.create"), data: contactSchema.strict(), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal("debt.create"), data: debtSchema.strict(), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal("debt.update"), data: debtSchema.safeExtend({ id: z.string().min(1).max(128) }).strict(), requestId: z.uuid() }).strict(),
]);
export const aiQuerySchema = z.object({
  resource: z.enum(["overview", "contacts", "contact", "debts", "debt"]).default("debts"),
  id: z.string().min(1).max(128).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(), contactId: z.string().max(128).optional(),
  type: z.enum(["RECEIVABLE", "PAYABLE"]).optional(), status: z.enum(["ACTIVE", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  from: dateSchema.optional(), to: dateSchema.optional(), min: z.string().regex(/^\d{1,13}$/).optional(), max: z.string().regex(/^\d{1,13}$/).optional(),
}).strict();
export const keyFields = { id: true, name: true, prefix: true, scopes: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true } as const;
export function hashIntegrationToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function integrationUrls(request: Request) {
  const origin = new URL(process.env.AUTH_URL || request.url).origin;
  return { apiUrl: `${origin}/api/ai`, openapiUrl: `${origin}/api/ai/openapi` };
}
export async function integrationUser(request: Request, scope: IntegrationScope) {
  const match = /^Bearer (dinkbit_[a-f0-9]{64})$/i.exec(request.headers.get("authorization") || "");
  if (!match) throw new ApiError("Cần token DinkBit trong Authorization: Bearer <token>.", 401);
  const key = await db.integrationKey.findUnique({ where: { tokenHash: hashIntegrationToken(match[1]) }, include: { user: { select: { sessionVersion: true } } } });
  if (!key || key.revokedAt || key.expiresAt <= new Date() || key.sessionVersion !== key.user.sessionVersion) throw new ApiError("Token không hợp lệ, đã hết hạn hoặc bị thu hồi.", 401);
  if (!key.scopes.includes(scope)) throw new ApiError(scope === "WRITE" ? "Token không có quyền ghi. Tạo token Đọc và ghi nếu cần." : "Token không có quyền đọc.", 403);
  await rateLimit(`ai:key:${key.id}`, 60, 60);
  await rateLimit(`ai:user:${key.userId}`, 120, 60);
  if (scope === "WRITE") await rateLimit(`ai:write:${key.userId}`, 20, 60);
  await db.integrationKey.updateMany({ where: { id: key.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { lastUsedAt: new Date() } });
  return key;
}
export function integrationError(error: unknown) {
  let response: Response;
  if (error instanceof ApiError) response = json({ error: error.message }, error.status);
  else if (error instanceof z.ZodError) response = json({ error: error.issues[0]?.message || "Dữ liệu không hợp lệ." }, 400);
  else if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2002", "P2034"].includes(error.code)) response = json({ error: "Dữ liệu vừa thay đổi hoặc không tồn tại. Hãy kiểm tra và thử lại cùng requestId." }, error.code === "P2025" ? 404 : 409);
  else {
    console.error("Integration API", error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "Unexpected error");
    response = json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
  }
  if (response.status === 401) response.headers.set("WWW-Authenticate", "Bearer");
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
