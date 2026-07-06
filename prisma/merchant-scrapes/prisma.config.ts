import "dotenv/config";
import { defineConfig } from "prisma/config";

function getMerchantScrapesDatabaseUrl() {
  const databaseUrl = process.env["MERCHANT_SCRAPES_DATABASE_URL"];

  if (!databaseUrl) {
    throw new Error(
      "Missing required environment variable: MERCHANT_SCRAPES_DATABASE_URL. Prisma CLI commands for merchant scrapes require this connection string.",
    );
  }

  return databaseUrl;
}

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: getMerchantScrapesDatabaseUrl(),
  },
});
