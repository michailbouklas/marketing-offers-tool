import { dev } from "$app/environment";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "$env/dynamic/private";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

function createPrismaClient() {
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

const cachedPrisma = globalForPrisma.prisma;

export const prisma =
  cachedPrisma && hasDataQualityDelegates(cachedPrisma)
    ? cachedPrisma
    : createPrismaClient();

if (dev) {
  globalForPrisma.prisma = prisma;
}
