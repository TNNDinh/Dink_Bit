import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { json } from "@/lib/security";
import { processReminders } from "@/lib/reminders";
export async function GET(request: Request) {
  const provided = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (!process.env.CRON_SECRET || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return json({ error: "Unauthorized" }, 401);
  const users = await db.user.findMany({ select: { id: true, reminderDays: true } });
  for (const user of users) await processReminders(user.id, user.reminderDays);
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return json({ processed: users.length });
}
