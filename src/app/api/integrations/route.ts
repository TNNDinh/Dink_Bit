import { randomBytes } from "node:crypto";
import { z } from "zod";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { serializable } from "@/lib/book";
import { ApiError, checkOrigin, json, rateLimit, readJson } from "@/lib/security";
import { hashIntegrationToken, integrationError, integrationUrls, keyFields, keyInputSchema } from "@/lib/integrations";

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const keys = await db.integrationKey.findMany({ where: { userId: user.id }, select: { ...keyFields, sessionVersion: true }, orderBy: { createdAt: "desc" }, take: 50 });
    return json({ ...integrationUrls(request), items: keys.map(({ sessionVersion, ...key }) => ({ ...key, active: !key.revokedAt && key.expiresAt > new Date() && sessionVersion === user.sessionVersion })) });
  } catch (error) { return integrationError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    await rateLimit(`integration:create:${user.id}`, 10, 3600);
    const input = keyInputSchema.parse(await readJson(request));
    const token = `dinkbit_${randomBytes(32).toString("hex")}`;
    const key = await serializable(async (transaction) => {
      const count = await transaction.integrationKey.count({ where: { userId: user.id, sessionVersion: user.sessionVersion, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (count >= 10) throw new ApiError("Tối đa 10 token hoạt động. Thu hồi token không dùng trước.", 409);
      return transaction.integrationKey.create({ data: { userId: user.id, name: input.name, tokenHash: hashIntegrationToken(token), prefix: token.slice(0, 16), scopes: input.access === "READ" ? ["READ"] : ["READ", "WRITE"], sessionVersion: user.sessionVersion, expiresAt: new Date(Date.now() + input.expiresInDays * 86400000) }, select: keyFields });
    });
    return json({ token, key }, 201);
  } catch (error) { return integrationError(error); }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    await rateLimit(`integration:revoke:${user.id}`, 30, 60);
    const { id } = z.object({ id: z.string().min(1).max(128) }).strict().parse(await readJson(request));
    const key = await db.integrationKey.findFirst({ where: { id, userId: user.id } });
    if (!key) throw new ApiError("Không tìm thấy token.", 404);
    await db.integrationKey.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return json({ success: true });
  } catch (error) { return integrationError(error); }
}
