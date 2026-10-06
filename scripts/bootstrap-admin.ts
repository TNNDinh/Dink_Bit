import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { adminEmail } from "../src/lib/admin-config";
import { hashPassword } from "../src/lib/password";

export async function bootstrapAdmin(db: PrismaClient) {
  const email = z.email().parse(adminEmail());
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.role === "ADMIN") return;
  const password = z.string().min(16).max(128).parse(process.env.ADMIN_PASSWORD);
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({ where: { email } });
    if (user?.role === "ADMIN") return;
    if (user) {
      await transaction.user.update({ where: { id: user.id }, data: { role: "ADMIN", passwordHash, sessionVersion: { increment: 1 } } });
      await transaction.session.deleteMany({ where: { userId: user.id } });
      await transaction.account.deleteMany({ where: { userId: user.id } });
      await transaction.passwordReset.deleteMany({ where: { userId: user.id } });
    } else {
      await transaction.user.create({ data: { email, name: "Quản trị viên", role: "ADMIN", passwordHash } });
    }
  }, { isolationLevel: "Serializable" });
  console.log(`Đã khởi tạo admin: ${email}. Mật khẩu xem tại ADMIN_PASSWORD trong .env.`);
}
