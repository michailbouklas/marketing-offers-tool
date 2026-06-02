import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { userRoles, type UserRole } from "../src/lib/auth/roles.js";

config(); // load .env

// Grant (or replace) roles for an existing user. Roles are stored as a
// comma-separated string in user.role (Better Auth's native multi-role form).
//
// Bootstrap use: after permission-gating user management, no admin holds
// `userManager`, so nobody can open /admin/users to assign roles. Run this
// once to seed a super-admin, then manage everyone else from the UI:
//
//   bun scripts/grant-roles.ts --email you@example.com --add userManager,approver,usageViewer

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const email = get("--email");
const addArg = get("--add");
const setArg = get("--set");

if (!email || (!addArg && !setArg)) {
  console.error(
    "Usage: bun scripts/grant-roles.ts --email <email> (--add <role,role> | --set <role,role>)\n" +
      `Known roles: ${userRoles.join(", ")}`,
  );
  process.exit(1);
}

function parseRoleList(value: string): UserRole[] {
  const parts = value
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  const invalid = parts.filter(
    (role) => !(userRoles as readonly string[]).includes(role),
  );
  if (invalid.length > 0) {
    console.error(
      `Unknown role(s): ${invalid.join(", ")}. Known roles: ${userRoles.join(", ")}`,
    );
    process.exit(1);
  }
  return parts as UserRole[];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, role: true },
});

if (!user) {
  console.error(`No user found with email "${email}".`);
  await prisma.$disconnect();
  process.exit(1);
}

const current = (user.role ?? "")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean) as UserRole[];

const next = setArg
  ? parseRoleList(setArg)
  : Array.from(new Set([...current, ...parseRoleList(addArg!)]));

const roleString = next.join(",");

await prisma.user.update({
  where: { id: user.id },
  data: { role: roleString, updatedAt: new Date() },
});

console.log(`✓ Updated roles for ${email}`);
console.log(`  Before: ${current.join(",") || "(none)"}`);
console.log(`  After : ${roleString || "(none)"}`);

await prisma.$disconnect();
