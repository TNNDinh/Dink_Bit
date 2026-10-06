import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import EmbeddedPostgres from "embedded-postgres";

async function run(entry: string, args: string[]) {
  const child = spawn(process.execPath, [resolve(entry), ...args], { stdio: "inherit", windowsHide: true, env: process.env });
  await new Promise<void>((resolveTask, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveTask() : reject(new Error(`Lệnh ${entry} kết thúc với mã ${code}.`)));
  });
}
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev:local chỉ dành cho máy phát triển.");
  if (!existsSync(".env")) {
    const template = readFileSync(".env.example", "utf8").replace("replace-with-a-random-secret-at-least-32-characters", randomBytes(32).toString("hex")).replace("replace-with-another-random-secret", randomBytes(32).toString("hex"));
    writeFileSync(".env", template, { flag: "wx" });
    console.log("Đã tạo .env với secret ngẫu nhiên.");
  }
  let environment = readFileSync(".env", "utf8");
  if (!environment.endsWith("\n")) environment += "\n";
  if (!/^ADMIN_EMAIL\s*=/m.test(environment)) environment += '\nADMIN_EMAIL="tranngocnguyendinh@gmail.com"\n';
  if (!process.env.ADMIN_PASSWORD && !/^ADMIN_PASSWORD\s*=\s*["']?[^\s"']+/m.test(environment)) {
    environment = environment.replace(/^ADMIN_PASSWORD\s*=.*(?:\r?\n|$)/m, "");
    environment += `ADMIN_PASSWORD="${randomBytes(24).toString("base64url")}"\n`;
    console.log("Đã tạo mật khẩu admin ngẫu nhiên trong .env.");
  }
  writeFileSync(".env", environment);
  loadEnvFile(".env");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/debtbook") throw new Error("dev:local chỉ dùng database debtbook trên localhost. Với database khác, chạy npm run dev.");
  url.hostname = "127.0.0.1";
  process.env.DATABASE_URL = url.toString();
  const databaseDir = resolve(".local/postgres-utf8");
  const postgres = new EmbeddedPostgres({ databaseDir, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port || 5432), persistent: true, authMethod: "scram-sha-256", initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: (message: unknown) => console.error(message) });
  let started = false;
  try {
    if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await postgres.initialise();
    await postgres.start(); started = true;
    const client = postgres.getPgClient(); await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'debtbook'"); await client.end();
    if (!result.rowCount) await postgres.createDatabase("debtbook");
    await run("node_modules/prisma/build/index.js", ["generate"]);
    await run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
    await run("node_modules/tsx/dist/cli.mjs", ["prisma/seed.ts"]);
    console.log("PostgreSQL local đã sẵn sàng. Mở http://localhost:3000. Ctrl+C để dừng.");
    const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1"], { stdio: "inherit", windowsHide: true, env: process.env });
    const stop = () => { child.kill("SIGTERM"); };
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
    await new Promise<void>((resolveTask, reject) => { child.on("error", reject); child.on("exit", () => resolveTask()); });
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
  } finally { if (started) await postgres.stop(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
