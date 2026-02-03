import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../../prisma/generated/prisma/client.js";

/**
 * Adaptateur MySql
 */
const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

/**
 * Instance Prisma globale
 */
export const prisma = new PrismaClient({ adapter });
