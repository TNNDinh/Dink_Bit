import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, checkOrigin, json, rateLimit, readJson } from "@/lib/security";
import { registrationSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { adminEmail } from "@/lib/admin-config";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { action, data } = z.object({ action: z.enum(["register", "forgot", "reset"]), data: z.unknown() }).parse(await readJson(request));
    if (action === "register") {
      const input = registrationSchema.parse(data);
      if (input.email === adminEmail()) throw new ApiError("Email này dành riêng cho tài khoản quản trị.", 409);
      await rateLimit(`register:${input.email}`, 5, 3600);
      await rateLimit("register:global", 200, 3600);
      await db.user.create({ data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) } });
      return json({ success: true }, 201);
    }
    if (action === "forgot") {
      const { email } = z.object({ email: z.email().transform((value) => value.toLowerCase()) }).parse(data);
      await rateLimit(`forgot:${email}`, 3, 3600);
      if (!process.env.SMTP_URL) throw new ApiError("Email khôi phục chưa được cấu hình. Liên hệ quản trị viên.", 503);
      const user = await db.user.findUnique({ where: { email } });
      if (user) {
        const token = randomBytes(32).toString("hex");
        await db.passwordReset.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 60000) } });
        const url = `${process.env.AUTH_URL}/reset-password?token=${token}`;
        await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.MAIL_FROM, to: email, subject: "Đặt lại mật khẩu DinkBit", text: `Mở liên kết sau để đặt lại mật khẩu (hết hạn sau 30 phút):\n${url}\nNếu bạn không yêu cầu, hãy bỏ qua email này.` });
      }
      return json({ message: "Nếu tài khoản tồn tại, bạn sẽ nhận được email hướng dẫn." });
    }
    const { token, password } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(10).max(128) }).parse(data);
    await rateLimit(`reset:${token}`, 5);
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (transaction) => {
      const reset = await transaction.passwordReset.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
      if (!reset || reset.expiresAt < new Date()) throw new ApiError("Liên kết đã hết hạn hoặc đã được sử dụng.");
      await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await transaction.passwordReset.deleteMany({ where: { userId: reset.userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0].message }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return json({ error: "Không thể tạo tài khoản với email này." }, 409);
    console.error("Account API", error);
    return json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
  }
}
