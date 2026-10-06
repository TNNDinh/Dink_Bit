import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env")) loadEnvFile(".env");
export default defineConfig({
  testDir: "./tests", testMatch: "browser.spec.ts", timeout: 90000, expect: { timeout: 15000 }, workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || "http://localhost:3000", viewport: { width: 1440, height: 1000 }, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined), trace: "retain-on-failure" },
});
