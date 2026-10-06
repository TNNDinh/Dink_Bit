import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { bootstrapAdmin } from "./bootstrap-admin";

if (existsSync(".env")) loadEnvFile(".env");
const db = new PrismaClient();
bootstrapAdmin(db).catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
