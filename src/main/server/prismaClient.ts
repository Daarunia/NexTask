import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../prisma/generated/prisma/client.js";
import { app } from "electron";
import path from "path";
import fs from "fs";

// Path to app.db or dev.db
const dbPath = fs.existsSync(path.join(process.cwd(), "dev.db"))
  ? path.join(process.cwd(), "dev.db")
  : path.join(app.getPath("userData"), "app.db");
const connectionString = `file:${dbPath}`;

const adapter = new PrismaBetterSqlite3({ url: connectionString });

// Create prisma client
export const prisma = new PrismaClient({ adapter, log: ["query"] });
