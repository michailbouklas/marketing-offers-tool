import { dev } from "$app/environment";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "$env/dynamic/private";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client";
import { createLazyProxy } from "./lazy-proxy";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConnectionString?: string;
};

function getDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  return env.DATABASE_URL;
}

function createPrismaClient() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
}

function hasDataQualityDelegates(client: PrismaClient) {
  return Boolean(
    client.channels &&
    client.dq_missing_offers_pricing &&
    client.dim_offers_staging &&
    client.dim_offers_audit,
  );
}

function getPrismaClient() {
  const connectionString = getDatabaseUrl();
  const cachedPrisma = globalForPrisma.prisma;

  if (
    cachedPrisma &&
    globalForPrisma.prismaConnectionString === connectionString &&
    hasDataQualityDelegates(cachedPrisma)
  ) {
    return cachedPrisma;
  }

  const prismaClient = createPrismaClient();

  if (dev) {
    globalForPrisma.prisma = prismaClient;
    globalForPrisma.prismaConnectionString = connectionString;
  }

  return prismaClient;
}

export const prisma = createLazyProxy(getPrismaClient);
