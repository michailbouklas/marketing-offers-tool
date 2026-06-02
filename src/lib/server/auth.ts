import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { env } from "$env/dynamic/private";
import { ac, roles } from "$lib/auth/permissions";
import { adminUserRole, defaultUserRole } from "$lib/auth/roles";
import { prisma } from "./prisma";
import { createLazyProxy } from "./lazy-proxy";

const globalForAuth = globalThis as typeof globalThis & {
  auth?: Auth;
  authConfigKey?: string;
};

function getRequiredEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getAuthConfig() {
  const secret = getRequiredEnv(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");
  const baseURL = getRequiredEnv(env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim())
    : [];

  return {
    secret,
    baseURL,
    trustedOrigins,
  };
}

function getAuthConfigKey(config: ReturnType<typeof getAuthConfig>) {
  return JSON.stringify(config);
}

function createAuth(config: ReturnType<typeof getAuthConfig>) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    plugins: [
      admin({
        ac,
        roles,
        adminRoles: [adminUserRole],
        defaultRole: defaultUserRole,
      }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

function getAuth() {
  const config = getAuthConfig();
  const authConfigKey = getAuthConfigKey(config);

  if (globalForAuth.auth && globalForAuth.authConfigKey === authConfigKey) {
    return globalForAuth.auth;
  }

  const authInstance = createAuth(config);
  globalForAuth.auth = authInstance;
  globalForAuth.authConfigKey = authConfigKey;

  return authInstance;
}

export const auth: Auth = createLazyProxy(getAuth);

export type AuthSession = typeof auth.$Infer.Session;
export type AuthSessionData = AuthSession["session"];
export type AuthUser = AuthSession["user"];
