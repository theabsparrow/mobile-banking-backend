import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  prisma_database_url: process.env.PRISMA_DATABASE_URL,
  mongodb_database_url: process.env.MONGODB_DATABASE_URL,
  client_url: process.env.CLIENT_URL,
  port: process.env.PORT
};