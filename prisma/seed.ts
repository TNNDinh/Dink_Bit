import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { bootstrapAdmin } from "../scripts/bootstrap-admin";
if (existsSync(".env")) loadEnvFile(".env");
const db = new PrismaClient();
function dateOffset(days: number) { const date = new Date(); const value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); const result = new Date(value); result.setUTCDate(result.getUTCDate() + days); return result; }
async function seed() {
  await bootstrapAdmin(db);
  const email = process.env.SEED_EMAIL || "demo@debtbook.vn", password = process.env.SEED_PASSWORD || "DebtBook@2026";
  if (process.env.NODE_ENV === "production" && (!process.env.SEED_PASSWORD || password === "DebtBook@2026")) throw new Error("Không sử dụng mật khẩu demo trong production.");
  const user = await db.user.upsert({ where: { email }, update: {}, create: { email, name: "Nguyễn Minh Anh", passwordHash: await hashPassword(password) } });
  await db.notification.updateMany({ where: { userId: user.id, type: "WELCOME", title: "Chào mừng đến với DebtBook" }, data: { title: "Chào mừng đến với DinkBit" } });
  if (await db.contact.count({ where: { userId: user.id } })) { console.log("Đã có dữ liệu. Seed không ghi đè."); return; }
  await db.$transaction(async (transaction) => {
    const names = ["Nguyễn Văn An", "Trần Văn Bình", "Lê Minh", "Phạm Nam", "Hoàng Thu Hà", "Đỗ Quỳnh Anh", "Vũ Đức Long", "Ngô Thanh Mai"];
    const contacts = await Promise.all(names.map((name, index) => transaction.contact.create({ data: { userId: user.id, name, phone: `09012345${String(index).padStart(2, "0")}`, note: "Dữ liệu minh họa" } })));
    const titles = ["Khoản vay cá nhân", "Tiền mua máy tính", "Chi phí chuyến đi", "Tiền ăn cuối tuần", "Tạm ứng dự án", "Chia tiền mua sắm", "Tiền thuê nhà", "Vé máy bay"];
    const amounts = [5000000, 2500000, 1200000, 800000, 7000000, 1800000, 3500000, 2200000];
    for (let index = 0; index < 24; index++) {
      const contact = contacts[index % contacts.length], totalAmount = BigInt(amounts[index % amounts.length]), type = index % 3 === 1 ? "PAYABLE" : "RECEIVABLE";
      const paidAmount = index % 5 === 0 ? totalAmount : index % 3 === 0 ? totalAmount / 4n : 0n;
      const createdDate = dateOffset(-85 + index * 3), dueDate = index % 6 === 0 ? null : dateOffset((index % 8) * 3 - 5);
      const debt = await transaction.debt.create({ data: { userId: user.id, contactId: contact.id, type, title: titles[index % titles.length], totalAmount, paidAmount, createdDate, dueDate, note: index % 4 === 0 ? "Đã thống nhất thanh toán qua chuyển khoản." : "" } });
      await transaction.activity.create({ data: { debtId: debt.id, kind: "CREATE", message: "Tạo khoản công nợ", amount: totalAmount, createdAt: createdDate } });
      if (paidAmount > 0n) {
        const transactionDate = dateOffset(-80 + index * 3);
        await transaction.transaction.create({ data: { userId: user.id, contactId: contact.id, debtId: debt.id, type, amount: paidAmount, paymentMethod: "BANK_TRANSFER", transactionDate, note: "Thanh toán minh họa", requestId: randomUUID() } });
        await transaction.activity.create({ data: { debtId: debt.id, kind: "PAYMENT", message: `${contact.name} · Ghi nhận thanh toán`, amount: paidAmount, createdAt: transactionDate } });
      }
    }
    await transaction.notification.create({ data: { userId: user.id, type: "WELCOME", title: "Chào mừng đến với DinkBit", message: "Đây là dữ liệu minh họa. Tạo tài khoản mới để bắt đầu cuốn sổ riêng." } });
  }, { timeout: 30000 });
  console.log(`Tài khoản demo: ${email}. Mật khẩu: SEED_PASSWORD trong .env (mặc định DebtBook@2026).`);
}
seed().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
