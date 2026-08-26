import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { signUserToken } from "../src/lib/server/external-auth-token.js";

config(); // load .env

// Mint a per-user bearer token for the Open WebUI tool server (user-level
// registration under Settings -> Integrations -> Tools, where the browser
// calls our API directly and cannot forward the user's email).
//
//   bun scripts/openwebui-token.ts --email you@example.com
//
// The token is an HMAC over the email keyed by OPENWEBUI_SHARED_SECRET — it
// is not stored anywhere. Rotating the secret invalidates every token; banning
// or deleting the user invalidates theirs. See docs/openwebui-integration.md.

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const email = get("--email");

if (!email) {
  console.error("Usage: bun scripts/openwebui-token.ts --email <email>");
  process.exit(1);
}

const secret = process.env.OPENWEBUI_SHARED_SECRET?.trim();

if (!secret) {
  console.error(
    "OPENWEBUI_SHARED_SECRET is not set in .env — the bridge is disabled and no token can be minted.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findFirst({
  where: { email: { equals: email.trim(), mode: "insensitive" } },
  select: { id: true, email: true, role: true, banned: true },
});

await prisma.$disconnect();

if (!user) {
  console.error(`No user found with email "${email}".`);
  process.exit(1);
}

if (user.banned) {
  console.error(`User "${user.email}" is banned; a token would be rejected.`);
  process.exit(1);
}

const token = signUserToken(secret, user.email);

console.log(`✓ Token for ${user.email} (roles: ${user.role || "(none)"})`);
console.log("");
console.log(token);
console.log("");
console.log(
  "Paste it as the Bearer key when adding the tool server in Open WebUI\n" +
    "(Settings -> Integrations -> Tools -> URL https://<host>/api/openwebui-tools, spec path openapi.json).\n" +
    "The user must hold a role with the sales:view permission, or requests are rejected with 403.",
);
