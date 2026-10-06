import { defineConfig } from "prisma/config";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env")) loadEnvFile(".env");
export default defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" } });
