import { randomUUID } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { ApiError, checkOrigin, json, rateLimit, readBody } from "@/lib/security";
function storage() {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new ApiError("Lưu trữ tệp chưa được cấu hình.", 503);
  return new S3Client({ endpoint: process.env.S3_ENDPOINT || undefined, region: process.env.S3_REGION || "us-east-1", forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    await rateLimit(`upload:${user.id}`, 20, 3600);
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) throw new ApiError("Tệp tối đa 5 MB.", 413);
    const bounded = await readBody(request, 6 * 1024 * 1024);
    const data = await new Response(new Uint8Array(bounded), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(), file = data.get("file"), debtId = String(data.get("debtId") || "");
    if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new ApiError("Chọn tệp dung lượng từ 1 byte đến 5 MB.");
    if (!await db.debt.findFirst({ where: { id: debtId, userId: user.id } })) throw new ApiError("Không tìm thấy công nợ.", 404);
    const bytes = Buffer.from(await file.arrayBuffer()), detected = await fileTypeFromBuffer(bytes);
    const extensions: Record<string, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "application/pdf": ["pdf"] };
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!detected || !extensions[detected.mime]?.includes(extension) || file.type !== detected.mime) throw new ApiError("Chỉ nhận JPG, PNG, WebP hoặc PDF có định dạng hợp lệ.");
    const client = storage(), fileKey = `${user.id}/${debtId}/${randomUUID()}.${extension}`;
    await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: fileKey, Body: bytes, ContentType: detected.mime }));
    try {
      const attachment = await db.attachment.create({ data: { userId: user.id, debtId, fileKey, fileName: file.name.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 200), fileType: detected.mime, size: file.size } });
      return json({ id: attachment.id, fileName: attachment.fileName }, 201);
    } catch (error) { await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: fileKey })); throw error; }
  } catch (error) { return json({ error: error instanceof ApiError ? error.message : "Không thể lưu tệp. Kiểm tra S3 và bucket." }, error instanceof ApiError ? error.status : 500); }
}
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const attachment = await db.attachment.findFirst({ where: { id: new URL(request.url).searchParams.get("id") || "", userId: user.id } });
    if (!attachment) throw new ApiError("Không tìm thấy tệp.", 404);
    const url = await getSignedUrl(storage(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: attachment.fileKey, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}` }), { expiresIn: 60 });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) { return json({ error: error instanceof ApiError ? error.message : "Không thể tải tệp." }, error instanceof ApiError ? error.status : 500); }
}
