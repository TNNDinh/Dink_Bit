import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { bootstrapAdmin } from "../scripts/bootstrap-admin";
import { hashPassword, verifyPassword } from "../src/lib/password";

if (existsSync(".env")) loadEnvFile(".env");
test("Bootstrap admin: chuyển quyền an toàn, giữ dữ liệu, không reset khi chạy lại", { skip: !process.env.TEST_BASE_URL }, async () => {
  const db = new PrismaClient(), email = `bootstrap-${randomUUID()}@example.com`;
  const previousEmail = process.env.ADMIN_EMAIL, previousPassword = process.env.ADMIN_PASSWORD;
  try {
    process.env.ADMIN_EMAIL = email;
    process.env.ADMIN_PASSWORD = "BootstrapPassword@2026";
    const user = await db.user.create({ data: { email, name: "Bootstrap test", passwordHash: await hashPassword("OldPassword@2026") } });
    await db.contact.create({ data: { userId: user.id, name: "Giữ nguyên dữ liệu" } });
    await db.session.create({ data: { userId: user.id, sessionToken: randomUUID(), expires: new Date(Date.now() + 60000) } });
    await db.account.create({ data: { userId: user.id, type: "oauth", provider: "google", providerAccountId: randomUUID() } });
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await bootstrapAdmin(db);
    const admin = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(admin.role, "ADMIN");
    assert.equal(admin.sessionVersion, 1);
    assert.ok(await verifyPassword("BootstrapPassword@2026", admin.passwordHash!));
    assert.equal(await db.contact.count({ where: { userId: user.id } }), 1);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.account.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.passwordReset.count({ where: { userId: user.id } }), 0);
    process.env.ADMIN_PASSWORD = "ChangedBootstrapPassword@2026";
    await bootstrapAdmin(db);
    const unchanged = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(unchanged.passwordHash, admin.passwordHash);
    assert.equal(unchanged.sessionVersion, admin.sessionVersion);
  } finally {
    if (previousEmail === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword;
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
