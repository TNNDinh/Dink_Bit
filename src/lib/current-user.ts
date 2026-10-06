import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/security";
export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.validUntil || session.user.validUntil < Date.now()) throw new ApiError("Vui lòng đăng nhập.", 401);
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, image: true, role: true, reminderDays: true, sessionVersion: true } });
  if (!user || user.sessionVersion !== session.user.sessionVersion) throw new ApiError("Phiên đăng nhập đã hết hạn.", 401);
  return user;
}
