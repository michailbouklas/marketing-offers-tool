import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "$env/dynamic/private";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/merchant-scrapes-prisma/client";
import { createLazyProxy } from "./lazy-proxy";

const globalForMerchantScrapesPrisma = globalThis as unknown as {
  merchantScrapesPrisma?: PrismaClient;
  merchantScrapesPrismaConnectionString?: string;
  merchantScrapesPrismaPool?: Pool;
};

function getMerchantScrapesDatabaseUrl() {
  if (!env.MERCHANT_SCRAPES_DATABASE_URL) {
    throw new Error(
      "Missing required environment variable: MERCHANT_SCRAPES_DATABASE_URL",
    );
  }

  return env.MERCHANT_SCRAPES_DATABASE_URL;
}

function createMerchantScrapesPrismaClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return {
    pool,
    prismaClient: new PrismaClient({ adapter }),
  };
}

function disposeMerchantScrapesPrismaClient(
  prismaClient: PrismaClient,
  pool: Pool | undefined,
) {
  void prismaClient
    .$disconnect()
    .finally(() => pool?.end())
    .catch(() => undefined);
}

function getMerchantScrapesPrismaClient() {
  const connectionString = getMerchantScrapesDatabaseUrl();
  const cachedPrisma = globalForMerchantScrapesPrisma.merchantScrapesPrisma;

  if (
    cachedPrisma &&
    globalForMerchantScrapesPrisma.merchantScrapesPrismaConnectionString ===
      connectionString
  ) {
    return cachedPrisma;
  }

  if (cachedPrisma) {
    disposeMerchantScrapesPrismaClient(
      cachedPrisma,
      globalForMerchantScrapesPrisma.merchantScrapesPrismaPool,
    );
  }

  const { pool, prismaClient } =
    createMerchantScrapesPrismaClient(connectionString);

  globalForMerchantScrapesPrisma.merchantScrapesPrisma = prismaClient;
  globalForMerchantScrapesPrisma.merchantScrapesPrismaConnectionString =
    connectionString;
  globalForMerchantScrapesPrisma.merchantScrapesPrismaPool = pool;

  return prismaClient;
}

export const merchantScrapesPrisma = createLazyProxy(
  getMerchantScrapesPrismaClient,
);
