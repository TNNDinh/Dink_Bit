import { Prisma } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "@/lib/current-user";
import { adminEmail } from "@/lib/admin-config";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { ApiError, checkOrigin, json, rateLimit, readJson } from "@/lib/security";
import { registrationSchema } from "@/lib/validation";

const accountFields = { id: true, name: true, email: true, role: true, createdAt: true } as const;
async function requireAdmin() {
  const user = await currentUser();
  if (user.role !== "ADMIN") throw new ApiError("Chỉ quản trị viên được thực hiện thao tác này.", 403);
  return user;
}
function handleError(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: error.issues[0].message }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return json({ error: "Email này đã có tài khoản." }, 409);
  console.error("Admin API", error);
  return json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
}
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const page = z.coerce.number().int().min(1).max(100000).parse(new URL(request.url).searchParams.get("page") ?? 1);
    const pageSize = 15;
    const [items, count] = await db.$transaction([
      db.user.findMany({ select: accountFields, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      db.user.count(),
    ]);
    return json({ items, count, page, pageSize });
  } catch (error) { return handleError(error); }
}
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    checkOrigin(request);
    const input = registrationSchema.strict().parse(await readJson(request));
    if (input.email === adminEmail()) throw new ApiError("Email này dành riêng cho tài khoản quản trị.", 409);
    await rateLimit(`admin:create:${admin.id}`, 30, 3600);
    const user = await db.user.create({ data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "USER" }, select: accountFields });
    return json(user, 201);
  } catch (error) { return handleError(error); }
}
