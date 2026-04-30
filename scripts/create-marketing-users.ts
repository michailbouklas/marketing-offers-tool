import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { defaultUserRole } from "../src/lib/auth/roles.js";

config();

const DEFAULT_PASSWORD = "123456789";

type BrandRecord = {
  id: number;
  name: string;
  alias: string;
  slug: string;
  active: boolean;
};

type UserSeed = {
  name: string;
  email: string;
  includeBrands?: string[];
  excludeBrands?: string[];
  useAllActiveBrands?: boolean;
};

const USER_SEEDS: UserSeed[] = [
  {
    name: "Elena Menelaou",
    email: "e.menelaou@phc.cy",
    useAllActiveBrands: true,
    excludeBrands: ["Nero"],
  },
  {
    name: "Charis Kassinou",
    email: "c.kassinou@phc.com.cy",
    includeBrands: ["Burger King"],
  },
  {
    name: "Melina Limnati",
    email: "melina@marketingbrief.cy",
    includeBrands: ["Burger King"],
  },
  {
    name: "Konstantina Velli",
    email: "c.velli@phc.com.cy",
    includeBrands: ["Nero"],
  },
  {
    name: "Chrysovalantis Dimitriou",
    email: "c.dimitriou@phc.com.cy",
    includeBrands: ["Nero"],
  },
  {
    name: "Anthia Markoulidou",
    email: "a.markoulidou@phc.com.cy",
    includeBrands: ["Taco Bell"],
  },
  {
    name: "Michalis Menelaou",
    email: "m.menelaou@phc.com.cy",
    includeBrands: ["Pizza Hut"],
  },
  {
    name: "Irene Charalambous",
    email: "ir.charalambous@phc.com.cy",
    includeBrands: ["Pizza Hut"],
  },
  {
    name: "Marina Symeou",
    email: "m.symeou@phc.com.cy",
    includeBrands: ["KFC"],
  },
  {
    name: "Marieva Efstathiou",
    email: "m.efstathiou@phc.com.cy",
    includeBrands: ["KFC"],
  },
  {
    name: "Efsevia Giorgalli",
    email: "e.giorgalli@phc.com.cy",
    includeBrands: ["wagamama"],
  },
  {
    name: "Christos Aspros",
    email: "c.aspros@phc.com.cy",
    includeBrands: ["wagamama"],
  },
  {
    name: "Stephanie Kousidou",
    email: "s.kousidou@phc.com.cy",
    includeBrands: ["jamies", "verdi", "kypriakon", "tavernaki"],
  },
];

const BRAND_SYNONYMS: Record<string, string[]> = {
  burgerking: ["burgerking", "bk"],
  nero: ["nero"],
  tacobell: ["tacobell", "tb"],
  pizzahut: ["pizzahut", "ph"],
  kfc: ["kfc"],
  wagamama: ["wagamama", "wag"],
  jamies: ["jamies", "jmo"],
  verdi: ["verdi", "ver"],
  kypriakon: ["kypriakon", "kyp"],
  tavernaki: ["tavernaki", "tav"],
};

function normalizeValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildAuth(prisma: PrismaClient) {
  const secret = getRequiredEnv("BETTER_AUTH_SECRET");
  const baseURL = getRequiredEnv("BETTER_AUTH_URL");
  const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) =>
        origin.trim(),
      )
    : [];

  return betterAuth({
    secret,
    baseURL,
    trustedOrigins,
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    plugins: [admin()],
  });
}

function addLookupEntry(
  lookup: Map<string, BrandRecord[]>,
  key: string,
  brand: BrandRecord,
) {
  if (!key) {
    return;
  }

  const existing = lookup.get(key) ?? [];

  if (!existing.some((entry) => entry.id === brand.id)) {
    existing.push(brand);
    lookup.set(key, existing);
  }
}

function buildBrandLookup(brands: BrandRecord[]) {
  const lookup = new Map<string, BrandRecord[]>();

  for (const brand of brands) {
    addLookupEntry(lookup, normalizeValue(brand.name), brand);
    addLookupEntry(lookup, normalizeValue(brand.alias), brand);
    addLookupEntry(lookup, normalizeValue(brand.slug), brand);
  }

  for (const aliases of Object.values(BRAND_SYNONYMS)) {
    const matchedBrands = brands.filter((brand) => {
      const brandKeys = new Set([
        normalizeValue(brand.name),
        normalizeValue(brand.alias),
        normalizeValue(brand.slug),
      ]);

      return aliases.some((alias) => brandKeys.has(normalizeValue(alias)));
    });

    if (matchedBrands.length !== 1) {
      continue;
    }

    for (const alias of aliases) {
      addLookupEntry(lookup, normalizeValue(alias), matchedBrands[0]);
    }
  }

  return lookup;
}

function resolveBrand(label: string, lookup: Map<string, BrandRecord[]>) {
  const matches = lookup.get(normalizeValue(label)) ?? [];

  if (matches.length === 0) {
    throw new Error(`No active brand matched \"${label}\".`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Brand label \"${label}\" matched multiple active brands: ${matches
        .map((brand) => brand.name)
        .join(", ")}.`,
    );
  }

  return matches[0];
}

function resolveBrandIds(seed: UserSeed, brands: BrandRecord[]) {
  const lookup = buildBrandLookup(brands);

  if (seed.useAllActiveBrands) {
    const excludedIds = new Set(
      (seed.excludeBrands ?? []).map((label) => resolveBrand(label, lookup).id),
    );

    return brands
      .filter((brand) => !excludedIds.has(brand.id))
      .map((brand) => brand.id)
      .sort((left, right) => left - right);
  }

  const includedIds = new Set(
    (seed.includeBrands ?? []).map((label) => resolveBrand(label, lookup).id),
  );

  if (includedIds.size === 0) {
    throw new Error(`No brands resolved for ${seed.email}.`);
  }

  return [...includedIds].sort((left, right) => left - right);
}

function formatFailure(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = Reflect.get(error, "message");

    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }

    const maybeStatus = Reflect.get(error, "status");
    const maybeStatusText = Reflect.get(error, "statusText");
    const parts = [maybeStatus, maybeStatusText].filter(
      (value): value is string | number =>
        (typeof value === "string" && value.trim().length > 0) ||
        typeof value === "number",
    );

    if (parts.length > 0) {
      return parts.join(" ");
    }

    try {
      const serialized = JSON.stringify(error);

      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Ignore serialization failures and fall back below.
    }
  }

  return String(error || "Unknown error");
}

async function replaceUserBrandAssignments(
  prisma: PrismaClient,
  userId: string,
  brandIds: number[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.user_brand.deleteMany({
      where: {
        userId,
      },
    });

    if (brandIds.length === 0) {
      return;
    }

    await tx.user_brand.createMany({
      data: brandIds.map((brandId) => ({
        userId,
        brandId,
      })),
      skipDuplicates: true,
    });
  });
}

const pool = new Pool({ connectionString: getRequiredEnv("DATABASE_URL") });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const auth = buildAuth(prisma);

async function main() {
  const activeBrands = await prisma.brand.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
      name: true,
      alias: true,
      slug: true,
      active: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  if (activeBrands.length === 0) {
    throw new Error("No active brands were found.");
  }

  let createdCount = 0;
  let updatedAssignmentsCount = 0;
  const failures: string[] = [];

  for (const seed of USER_SEEDS) {
    try {
      const brandIds = resolveBrandIds(seed, activeBrands);
      const existingUser = await prisma.user.findUnique({
        where: {
          email: seed.email,
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        await replaceUserBrandAssignments(prisma, existingUser.id, brandIds);
        updatedAssignmentsCount += 1;
        console.log(
          `~ Existing user ${seed.email}; refreshed ${brandIds.length} brand assignments.`,
        );
        continue;
      }

      await auth.api.createUser({
        body: {
          email: seed.email,
          name: seed.name,
          password: DEFAULT_PASSWORD,
          role: defaultUserRole,
        },
      });

      const createdUser = await prisma.user.findUniqueOrThrow({
        where: {
          email: seed.email,
        },
        select: {
          id: true,
        },
      });

      await replaceUserBrandAssignments(prisma, createdUser.id, brandIds);
      createdCount += 1;

      console.log(
        `+ Created ${seed.email} with ${brandIds.length} brand assignments.`,
      );
    } catch (error) {
      const message = formatFailure(error);
      failures.push(`${seed.email}: ${message}`);
      console.error(`x Failed for ${seed.email}: ${message}`);
    }
  }

  console.log("\nSummary");
  console.log(`  Created users           : ${createdCount}`);
  console.log(`  Updated existing users  : ${updatedAssignmentsCount}`);
  console.log(`  Failed users            : ${failures.length}`);
  console.log(`  Password for new users  : ${DEFAULT_PASSWORD}`);

  if (failures.length > 0) {
    throw new Error(`Failed users:\n- ${failures.join("\n- ")}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  await pool.end();
}
