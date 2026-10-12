import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "$env/dynamic/private";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/google-reviews-prisma/client";
import { createLazyProxy } from "./lazy-proxy";

/**
 * Server-only Prisma client for the **Google Reviews scraper Postgres**
 * (`google_maps_scraper`, resolved from `GOOGLE_REVIEWS_DB`). This is the
 * source of truth that the ClickHouse `google_maps_scraper_replica` database
 * (read by `src/lib/services/google-reviews/*`) is replicated from, so writes
 * made here show up in the analytics pages once replication catches up.
 *
 * Generated from `prisma/google-reviews/schema.prisma` (generate-only; the
 * scraper project owns that database's migrations).
 */

const globalForGoogleReviewsPrisma = globalThis as unknown as {
  googleReviewsPrisma?: PrismaClient;
  googleReviewsPrismaConnectionString?: string;
  googleReviewsPrismaPool?: Pool;
};

function getGoogleReviewsDatabaseUrl() {
  if (!env.GOOGLE_REVIEWS_DB) {
    throw new Error("Missing required environment variable: GOOGLE_REVIEWS_DB");
  }

  return env.GOOGLE_REVIEWS_DB;
}

function createGoogleReviewsPrismaClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return {
    pool,
    prismaClient: new PrismaClient({ adapter }),
  };
}

function disposeGoogleReviewsPrismaClient(
  prismaClient: PrismaClient,
  pool: Pool | undefined,
) {
  void prismaClient
    .$disconnect()
    .finally(() => pool?.end())
    .catch(() => undefined);
}

function getGoogleReviewsPrismaClient() {
  const connectionString = getGoogleReviewsDatabaseUrl();
  const cachedPrisma = globalForGoogleReviewsPrisma.googleReviewsPrisma;

  if (
    cachedPrisma &&
    globalForGoogleReviewsPrisma.googleReviewsPrismaConnectionString ===
      connectionString
  ) {
    return cachedPrisma;
  }

  if (cachedPrisma) {
    disposeGoogleReviewsPrismaClient(
      cachedPrisma,
      globalForGoogleReviewsPrisma.googleReviewsPrismaPool,
    );
  }

  const { pool, prismaClient } =
    createGoogleReviewsPrismaClient(connectionString);

  globalForGoogleReviewsPrisma.googleReviewsPrisma = prismaClient;
  globalForGoogleReviewsPrisma.googleReviewsPrismaConnectionString =
    connectionString;
  globalForGoogleReviewsPrisma.googleReviewsPrismaPool = pool;

  return prismaClient;
}

export const googleReviewsPrisma = createLazyProxy(
  getGoogleReviewsPrismaClient,
);
