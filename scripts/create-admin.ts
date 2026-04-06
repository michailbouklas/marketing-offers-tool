import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "crypto";
import { adminUserRole, defaultUserRole } from "../src/lib/auth/roles.js";

config(); // load .env

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const email = get("--email");
const password = get("--password");
const name = get("--name") ?? "Admin";
const role = get("--role") ?? adminUserRole;

if (!email || !password) {
  console.error(
    "Usage: bun scripts/create-admin.ts --email <email> --password <password> [--name <name>] [--role <admin|user>]",
  );
  process.exit(1);
}

if (role !== adminUserRole && role !== defaultUserRole) {
  console.error('Role must be either "admin" or "user".');
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const now = new Date();
const userId = randomUUID();
const accountId = randomUUID();
const hashed = await hashPassword(password);

// Check if the user already exists
const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.error(`A user with email "${email}" already exists.`);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.$transaction([
  prisma.user.create({
    data: {
      id: userId,
      name,
      email,
      emailVerified: true,
      role,
      banned: false,
      banReason: null,
      banExpires: null,
      createdAt: now,
      updatedAt: now,
    },
  }),
  prisma.account.create({
    data: {
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    },
  }),
]);

console.log(`✓ User created successfully.`);
console.log(`  Email : ${email}`);
console.log(`  Name  : ${name}`);
console.log(`  Role  : ${role}`);

await prisma.$disconnect();
