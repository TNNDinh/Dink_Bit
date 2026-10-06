import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import type { Debt, Contact, Overview } from "../src/lib/types";
import { localDate } from "../src/lib/utils";
if (existsSync(".env")) loadEnvFile(".env");
const baseUrl = process.env.TEST_BASE_URL;
class Client {
  cookies = new Map<string, string>();
  async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, { ...options, redirect: "manual", headers: { Origin: baseUrl!, Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...options.headers } });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], index = pair.indexOf("="); this.cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    return response;
  }
  async json<T = Record<string, unknown>>(path: string, options: RequestInit = {}) { const response = await this.request(path, options); return { status: response.status, data: await response.json() as T }; }
  action<T = Record<string, unknown>>(action: string, data: unknown) { return this.json<T>("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) }); }
  async registerAndLogin(email: string) {
    const registered = await this.json("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", data: { email, name: "Người kiểm thử", password: "TestPassword@2026" } }) });
    assert.equal(registered.status, 201, JSON.stringify(registered.data));
    return this.login(email, "TestPassword@2026");
  }
  async login(email: string, password: string) {
    const csrf = await this.json<{ csrfToken: string }>("/api/auth/csrf");
    const login = await this.request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email, password, remember: "true", callbackUrl: baseUrl! }) });
    assert.equal(login.status, 200);
    const session = await this.json<{ user: { id: string } }>("/api/auth/session");
    assert.ok(session.data.user?.id, "Phiên đăng nhập hợp lệ");
    return session.data.user.id;
  }
}
test("AI API: token, phân quyền, ghi đúng một lần, hết hạn và thu hồi", { skip: !baseUrl, timeout: 180000 }, async () => {
  const db = new PrismaClient(), owner = new Client(), other = new Client();
  const suffix = randomUUID(), emails = [`ai-owner-${suffix}@example.com`, `ai-other-${suffix}@example.com`];
  type KeyResult = { token: string; key: { id: string; prefix: string; scopes: string[] } };
  const createKey = (client: Client, name: string, access = "READ") => client.json<KeyResult>("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, access, expiresInDays: 7 }) });
  const get = (token: string, query = "") => new Client().json(`/api/ai${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const write = <Result = Contact>(token: string, action: string, data: unknown, requestId = randomUUID()) => new Client().json<{ requestId: string; result: Result }>("/api/ai", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, data, requestId }) });
  try {
    assert.equal((await new Client().json("/api/ai")).status, 401);
    assert.equal((await new Client().json("/api/integrations")).status, 401);
    const ownerId = await owner.registerAndLogin(emails[0]);
    await other.registerAndLogin(emails[1]);
    assert.equal((await owner.json("/api/ai")).status, 401, "Session không thay cho token của AI");
    const readKey = await createKey(owner, "AI chỉ đọc"), writeKey = await createKey(owner, "AI ghi", "READ_WRITE"), otherKey = await createKey(other, "AI khác", "READ_WRITE");
    assert.deepEqual([readKey.status, writeKey.status, otherKey.status], [201, 201, 201]);
    const defaultKey = await owner.json<KeyResult>("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Quyền mặc định" }) });
    assert.equal(defaultKey.status, 201); assert.deepEqual(defaultKey.data.key.scopes, ["READ"]);
    assert.match(writeKey.data.token, /^dinkbit_[a-f0-9]{64}$/);
    const saved = await db.integrationKey.findUniqueOrThrow({ where: { id: writeKey.data.key.id } });
    assert.equal(saved.tokenHash, createHash("sha256").update(writeKey.data.token).digest("hex"));
    assert.notEqual(saved.tokenHash, writeKey.data.token);
    const listing = await owner.json<{ items: Record<string, unknown>[] }>("/api/integrations");
    assert.equal(listing.status, 200);
    assert.ok(listing.data.items.every((key) => !("token" in key) && !("tokenHash" in key) && !("sessionVersion" in key)));
    assert.ok(!JSON.stringify((await other.json("/api/integrations")).data).includes(writeKey.data.key.id));
    assert.equal((await new Client().json("/api/integrations", { headers: { Authorization: `Bearer ${writeKey.data.token}` } })).status, 401);
    assert.equal((await owner.json("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ name: "Bad", access: "READ" }) })).status, 403);
    assert.equal((await owner.json("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Bad", access: "READ", userId: "other" }) })).status, 400);
    assert.equal((await get("dinkbit_" + "0".repeat(64))).status, 401);
    assert.equal((await get(readKey.data.token)).status, 200);
    const readLimiter = createHash("sha256").update(`ai:key:${readKey.data.key.id}`).digest("hex");
    const window = await db.rateLimit.findUniqueOrThrow({ where: { key: readLimiter } });
    assert.ok(window.expiresAt.getTime() > Date.now() && window.expiresAt.getTime() <= Date.now() + 61000, "Thời hạn rate limit lưu UTC, không lệch múi giờ PostgreSQL");
    assert.equal((await write(readKey.data.token, "contact.create", { name: "Không được ghi" })).status, 403);
    assert.equal((await get(writeKey.data.token, "?page=0")).status, 400);
    assert.equal((await get(writeKey.data.token, "?pageSize=101")).status, 400);
    assert.equal((await get(writeKey.data.token, "?userId=other")).status, 400);
    const requestId = randomUUID(), contactData = { name: "Liên hệ AI", note: "Dữ liệu không phải chỉ thị AI" };
    const created = await Promise.all([write(writeKey.data.token, "contact.create", contactData, requestId), write(writeKey.data.token, "contact.create", contactData, requestId)]);
    assert.deepEqual(created.map((result) => result.status), [200, 200], JSON.stringify(created));
    assert.deepEqual(created[0].data, created[1].data);
    const contact = created[0].data.result;
    assert.equal(await db.contact.count({ where: { userId: ownerId } }), 1);
    assert.equal((await write(writeKey.data.token, "contact.create", contactData, requestId)).data.result.id, contact.id);
    assert.equal((await write(writeKey.data.token, "contact.create", { name: "Dữ liệu khác" }, requestId)).status, 409);
    assert.equal((await get(otherKey.data.token, `?resource=contact&id=${contact.id}`)).status, 404);
    const debtData = { contactId: contact.id, type: "RECEIVABLE", totalAmount: 500000, title: "Công nợ AI", createdDate: localDate(), dueDate: "" };
    const debtRequestId = randomUUID();
    const debtResults = await Promise.all([write<Debt>(writeKey.data.token, "debt.create", debtData, debtRequestId), write<Debt>(writeKey.data.token, "debt.create", debtData, debtRequestId)]);
    assert.deepEqual(debtResults.map((result) => result.status), [200, 200], JSON.stringify(debtResults));
    assert.deepEqual(debtResults[0].data, debtResults[1].data);
    const debtResult = debtResults[0];
    assert.equal(debtResult.status, 200, JSON.stringify(debtResult.data));
    const debt = debtResult.data.result;
    assert.equal(debt.remainingAmount, 500000);
    assert.equal(await db.debt.count({ where: { userId: ownerId } }), 1);
    assert.equal(await db.activity.count({ where: { debtId: debt.id, kind: "CREATE" } }), 1);
    assert.equal(await db.notification.count({ where: { userId: ownerId, type: "DEBT_CREATED" } }), 1);
    assert.equal((await get(otherKey.data.token, `?resource=debt&id=${debt.id}`)).status, 404);
    const foreignContact = await other.action<Contact>("contact.create", { name: "Liên hệ khác" });
    assert.equal((await write(writeKey.data.token, "debt.create", { ...debtData, contactId: foreignContact.data.id })).status, 400);
    assert.equal((await write(otherKey.data.token, "debt.update", { ...debtData, id: debt.id, contactId: foreignContact.data.id })).status, 404);
    assert.equal((await write(writeKey.data.token, "debt.create", { ...debtData, userId: "other" })).status, 400);
    assert.equal((await write(writeKey.data.token, "debt.delete", { id: debt.id })).status, 400);
    assert.equal((await write(writeKey.data.token, "payment.create", { debtId: debt.id, amount: 1 })).status, 400);
    assert.equal((await write(writeKey.data.token, "debt.create", { ...debtData, totalAmount: 1.5 })).status, 400);
    const retryId = randomUUID();
    assert.equal((await write(writeKey.data.token, "debt.create", { ...debtData, createdDate: "2200-01-01" }, retryId)).status, 400);
    assert.equal(await db.integrationRequest.count({ where: { keyId: writeKey.data.key.id, requestId: retryId } }), 0);
    assert.equal((await write(writeKey.data.token, "debt.create", { ...debtData, title: "Ghi sau lỗi validation" }, retryId)).status, 200);
    const updated = await write<Debt>(writeKey.data.token, "debt.update", { ...debtData, id: debt.id, title: "Đã sửa qua AI" });
    assert.equal(updated.status, 200); assert.equal(updated.data.result.title, "Đã sửa qua AI");
    await owner.action("payment.create", { debtId: debt.id, amount: 100000, paymentMethod: "CASH", transactionDate: localDate(), requestId: randomUUID(), note: "" });
    assert.equal((await write(writeKey.data.token, "debt.update", { ...debtData, id: debt.id, totalAmount: 50000 })).status, 400);
    const details = await get(readKey.data.token, `?resource=debt&id=${debt.id}`);
    assert.equal(details.status, 200);
    assert.equal(details.data.paidAmount, 100000);
    assert.ok(Array.isArray(details.data.transactions));
    assert.equal((await get(readKey.data.token, "?resource=overview")).status, 200);
    assert.equal((await get(readKey.data.token, "?resource=contacts&pageSize=1")).data.count, 1);
    assert.ok(!JSON.stringify(details.data).includes("passwordHash"));
    const malformed = await new Client().request("/api/ai", { method: "POST", headers: { Authorization: `Bearer ${writeKey.data.token}`, "Content-Type": "application/json" }, body: "{" });
    assert.equal(malformed.status, 400);
    assert.equal((await new Client().request("/api/ai", { method: "POST", headers: { Authorization: `Bearer ${writeKey.data.token}`, "Content-Type": "application/json" }, body: "x".repeat(33000) })).status, 413);
    const spec = await new Client().json<{ openapi: string; components: { securitySchemes: { bearerAuth: { scheme: string } } } }>("/api/ai/openapi");
    assert.equal(spec.status, 200); assert.equal(spec.data.openapi, "3.1.0"); assert.equal(spec.data.components.securitySchemes.bearerAuth.scheme, "bearer");
    assert.ok(!JSON.stringify(spec.data).includes(writeKey.data.token));
    assert.ok(!JSON.stringify(spec.data).includes(contactData.note));
    const expired = await createKey(owner, "Đã hết hạn");
    await db.integrationKey.update({ where: { id: expired.data.key.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await get(expired.data.token)).status, 401);
    const limiter = createHash("sha256").update(`ai:key:${readKey.data.key.id}`).digest("hex");
    await db.rateLimit.upsert({ where: { key: limiter }, create: { key: limiter, count: 60, expiresAt: new Date(Date.now() + 60000) }, update: { count: 60, expiresAt: new Date(Date.now() + 60000) } });
    const limited = await new Client().request("/api/ai", { headers: { Authorization: `Bearer ${readKey.data.token}` } });
    assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
    await db.rateLimit.update({ where: { key: limiter }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await get(readKey.data.token)).status, 200);
    assert.equal((await db.rateLimit.findUniqueOrThrow({ where: { key: limiter } })).count, 1);
    assert.equal((await other.json("/api/integrations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: writeKey.data.key.id }) })).status, 404);
    assert.equal((await owner.json("/api/integrations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: readKey.data.key.id }) })).status, 200);
    assert.equal((await get(readKey.data.token)).status, 401);
    assert.ok((await db.integrationKey.findUniqueOrThrow({ where: { id: writeKey.data.key.id } })).lastUsedAt);
    await db.user.update({ where: { id: ownerId }, data: { sessionVersion: { increment: 1 } } });
    assert.equal((await get(writeKey.data.token)).status, 401);
  } finally {
    const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } }), ids = users.map((user) => user.id);
    await db.transaction.deleteMany({ where: { userId: { in: ids } } });
    await db.debt.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});

test("Admin: tạo tài khoản, chống nâng quyền, dữ liệu riêng tư", { skip: !baseUrl, timeout: 120000 }, async () => {
  const db = new PrismaClient(), admin = new Client(), normal = new Client(), created = new Client();
  const suffix = randomUUID(), emails = [`normal-${suffix}@example.com`, `created-${suffix}@example.com`];
  const adminEmail = process.env.ADMIN_EMAIL || "tranngocnguyendinh@gmail.com";
  const payload = { name: "Tài khoản do admin tạo", email: emails[1], password: "CreatedPassword@2026" };
  const post = (client: Client, data: unknown) => client.json<{ id: string; role: string }>("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  try {
    assert.equal((await new Client().json("/api/admin")).status, 401);
    await normal.registerAndLogin(emails[0]);
    assert.equal((await normal.json("/api/admin")).status, 403);
    assert.equal((await post(normal, payload)).status, 403);
    const reserved = await new Client().json("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", data: { ...payload, email: adminEmail.toUpperCase(), role: "ADMIN" } }) });
    assert.equal(reserved.status, 409);
    const adminId = await admin.login(adminEmail, process.env.ADMIN_PASSWORD!);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: adminId } })).role, "ADMIN");
    assert.equal((await post(admin, { ...payload, role: "ADMIN" })).status, 400);
    assert.equal((await post(admin, { ...payload, email: adminEmail })).status, 409);
    const result = await post(admin, payload);
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.role, "USER");
    assert.equal((await post(admin, payload)).status, 409);
    await created.login(payload.email, payload.password);
    assert.equal((await created.json("/api/admin")).status, 403);
    const listing = await admin.json<{ items: { email: string; role: string; passwordHash?: string }[] }>("/api/admin");
    assert.equal(listing.status, 200);
    assert.ok(listing.data.items.some((account) => account.email === payload.email && account.role === "USER"));
    assert.ok(listing.data.items.every((account) => !("passwordHash" in account)));
    assert.equal((await admin.json("/api/admin?page=0")).status, 400);
    assert.equal((await admin.request("/api/admin", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify(payload) })).status, 403);
    const contact = await created.action<Contact>("contact.create", { name: "Liên hệ riêng" });
    const debt = await created.action<Debt>("debt.create", { contactId: contact.data.id, type: "RECEIVABLE", title: "Công nợ riêng", totalAmount: 1000, createdDate: localDate(), dueDate: localDate() });
    assert.equal(debt.status, 200);
    assert.equal((await admin.json(`/api/book?resource=debt&id=${debt.data.id}`)).status, 404);
    assert.equal((await admin.json(`/api/book?resource=contact&id=${contact.data.id}`)).status, 404);
    await db.user.update({ where: { id: result.data.id }, data: { role: "ADMIN" } });
    assert.equal((await created.json("/api/admin")).status, 200);
    await db.user.update({ where: { id: result.data.id }, data: { role: "USER" } });
    assert.equal((await created.json("/api/admin")).status, 403);
    await db.user.update({ where: { id: result.data.id }, data: { sessionVersion: { increment: 1 } } });
    assert.equal((await created.json("/api/admin")).status, 401);
  } finally {
    const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = users.map((user) => user.id);
    await db.transaction.deleteMany({ where: { userId: { in: ids } } });
    await db.debt.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});

test("API thật: CRUD, phân quyền, idempotency, thanh toán đồng thời, báo cáo", { skip: !baseUrl, timeout: 120000 }, async () => {
  const db = new PrismaClient(), first = new Client(), second = new Client(), suffix = randomUUID(), emails = [`first-${suffix}@example.com`, `second-${suffix}@example.com`];
  try {
    assert.equal((await new Client().json("/api/book")).status, 401);
    await first.registerAndLogin(emails[0]); await second.registerAndLogin(emails[1]);
    const contactResult = await first.action<Contact>("contact.create", { name: "Nguyễn Kiểm Thử" });
    assert.equal(contactResult.status, 200); const contact = contactResult.data;
    const debtResult = await first.action<Debt>("debt.create", { contactId: contact.id, type: "RECEIVABLE", title: "Công nợ kiểm thử", totalAmount: 1000, createdDate: localDate(), dueDate: localDate() });
    assert.equal(debtResult.status, 200); const debt = debtResult.data;
    assert.equal(debt.status, "ACTIVE"); assert.equal(debt.remainingAmount, 1000);
    const notifications = await Promise.all([first.json("/api/book?resource=notifications"), first.json("/api/book?resource=notifications")]);
    assert.deepEqual(notifications.map((result) => result.status), [200, 200]);
    assert.equal((await first.request("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
    assert.equal((await first.request("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(33000) })).status, 413);
    assert.equal((await second.json(`/api/book?resource=debt&id=${debt.id}`)).status, 404);
    assert.equal((await second.json(`/api/book?resource=contact&id=${contact.id}`)).status, 404);
    assert.equal((await second.action("debt.note", { id: debt.id, note: "Không được phép" })).status, 404);
    assert.equal((await second.action("debt.create", { contactId: contact.id, type: "PAYABLE", totalAmount: 500, createdDate: localDate() })).status, 400);
    const payment = { debtId: debt.id, amount: 300, transactionDate: localDate(), paymentMethod: "CASH", note: "Lần đầu", requestId: randomUUID() };
    assert.equal((await first.action("payment.create", { ...payment, amount: 1001 })).status, 400);
    assert.equal((await first.action("payment.create", { ...payment, amount: 0 })).status, 400);
    assert.equal((await second.action("payment.create", payment)).status, 404);
    assert.equal((await first.action("payment.create", payment)).status, 200);
    assert.equal((await first.action("payment.create", payment)).status, 200);
    const afterReplay = await first.json<Debt>(`/api/book?resource=debt&id=${debt.id}`);
    assert.equal(afterReplay.data.paidAmount, 300); assert.equal(afterReplay.data.transactions?.length, 1); assert.equal(afterReplay.data.status, "PARTIALLY_PAID");
    assert.equal((await first.action("payment.create", { ...payment, amount: 301 })).status, 409);
    assert.equal((await first.action("payment.create", { ...payment, amount: 400, requestId: randomUUID() })).status, 200);
    const concurrent = await Promise.all([first.action("payment.create", { ...payment, amount: 200, requestId: randomUUID() }), first.action("payment.create", { ...payment, amount: 200, requestId: randomUUID() })]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 400]);
    assert.equal((await first.json<Debt>(`/api/book?resource=debt&id=${debt.id}`)).data.paidAmount, 900);
    assert.equal((await first.action("payment.create", { ...payment, amount: 100, requestId: randomUUID() })).status, 200);
    const final = await first.json<Debt>(`/api/book?resource=debt&id=${debt.id}`);
    assert.equal(final.data.status, "PAID"); assert.equal(final.data.remainingAmount, 0);
    assert.equal((await first.action("debt.delete", { id: debt.id })).status, 400);
    const overview = await first.json<Overview>("/api/book?resource=overview");
    assert.equal(overview.status, 200); assert.equal(overview.data.totals.collected, 1000); assert.equal(overview.data.totals.receivable, 0);
    const csv = await first.request("/api/export?format=csv"); assert.equal(csv.status, 200); assert.match(await csv.text(), /Nguyễn Kiểm Thử/);
    assert.match(csv.headers.get("content-disposition") || "", /filename="dinkbit-\d{4}-\d{2}-\d{2}\.csv"/);
    const excel = await first.request("/api/export?format=xlsx"); assert.equal(excel.status, 200); assert.equal(Buffer.from(await excel.arrayBuffer()).subarray(0, 2).toString(), "PK");
    assert.match(excel.headers.get("content-disposition") || "", /filename="dinkbit-\d{4}-\d{2}-\d{2}\.xlsx"/);
    const attachment = new FormData(); attachment.set("debtId", debt.id); attachment.set("file", new Blob(["not an image"], { type: "image/png" }), "fake.png");
    assert.equal((await first.request("/api/attachments", { method: "POST", body: attachment })).status, 400);
    const forbidden = await first.request("/api/book", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ action: "contact.create", data: { name: "CSRF" } }) }); assert.equal(forbidden.status, 403);
    assert.equal((await second.json<Overview>("/api/book?resource=overview")).data.totals.collected, 0);
    assert.equal((await first.action("debt.close", { id: debt.id })).status, 200);
    assert.equal((await first.json<Debt>(`/api/book?resource=debt&id=${debt.id}`)).data.status, "CANCELLED");
  } finally {
    const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } }), userIds = users.map((user) => user.id);
    await db.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await db.debt.deleteMany({ where: { userId: { in: userIds } } });
    await db.contact.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
});
