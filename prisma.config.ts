import { defineConfig } from "prisma/config";
import path from "path";

const defaultDbPath = path.join(process.cwd(), "dev.db");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: `file:${defaultDbPath}`,
  },
  generator: {
    provider: "prisma-client",
  },
});
