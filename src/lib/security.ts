import { createHash } from "node:crypto";
import { db } from "@/lib/db";
export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function rateLimit(key: string, limit = 10, seconds = 900) {
  const hashed = createHash("sha256").update(key).digest("hex");
  const expiresAt = new Date(Date.now() + seconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES (${hashed}, 1, ${expiresAt} AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."expiresAt" < (NOW() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < (NOW() AT TIME ZONE 'UTC') THEN ${expiresAt} AT TIME ZONE 'UTC' ELSE "RateLimit"."expiresAt" END
    RETURNING "count"`;
  if (rows[0].count > limit) throw new ApiError("Thao tác quá nhiều lần. Vui lòng thử lại sau.", 429);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.AUTH_URL ?? request.url).origin;
  if (origin !== expected) throw new ApiError("Yêu cầu không hợp lệ.", 403);
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value, (_, item) => typeof item === "bigint" ? Number(item) : item), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export async function readBody(request: Request, maximum = 32768) {
  if (Number(request.headers.get("content-length")) > maximum) throw new ApiError("Dữ liệu gửi lên quá lớn.", 413);
  if (!request.body) throw new ApiError("Yêu cầu thiếu dữ liệu.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new ApiError("Dữ liệu gửi lên quá lớn.", 413); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
export async function readJson(request: Request) {
  const bytes = await readBody(request);
  try { return JSON.parse(bytes.toString("utf8")) as unknown; }
  catch { throw new ApiError("Dữ liệu JSON không hợp lệ."); }
}
