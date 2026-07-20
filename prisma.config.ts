
import "dotenv/config";
import { defineConfig } from "prisma/config";
import config from "./src/config/index.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: config.prisma_database_url as string,
  },
});
