import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI config for the external Google Reviews scraper database. This
 * database is owned by the scraper project (it has its own `_prisma_migrations`),
 * so this config deliberately declares no `migrations` path: only
 * `prisma generate` / `prisma validate` are meant to run against it.
 */
function getGoogleReviewsDatabaseUrl() {
  const databaseUrl = process.env["GOOGLE_REVIEWS_DB"];

  if (!databaseUrl) {
    throw new Error(
      "Missing required environment variable: GOOGLE_REVIEWS_DB. Prisma CLI commands for the Google Reviews database require this connection string.",
    );
  }

  return databaseUrl;
}

export default defineConfig({
  schema: "schema.prisma",
  datasource: {
    url: getGoogleReviewsDatabaseUrl(),
  },
});
