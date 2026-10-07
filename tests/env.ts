import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.STORAGE_MODE = "memory";
process.env.APP_URL = "http://localhost:3100";
