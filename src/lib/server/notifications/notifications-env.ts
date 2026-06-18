import { env } from "$env/dynamic/private";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * Configuration for the offer-notification digest (Part B consumer). Reads the
 * read-only connection to the scraper Postgres (`SCRAPER_DATABASE_URL`), the
 * SMTP transport for digest emails, and the digest schedule. Follows the same
 * `readEnv` precedence (.env file → process.env → `$env/dynamic/private`) and
 * `globalThis` caching as `src/lib/server/env.ts` so behaviour is identical
 * across dev, build, and the Node adapter at runtime.
 *
 * Missing/invalid config never crashes the server: `getNotificationsEnv()`
 * falls back to safe defaults and `hasNotificationsTransport()` reports whether
 * the digest can actually run, so the scheduler self-disables cleanly.
 */

const globalForNotificationsEnv = globalThis as typeof globalThis & {
  notificationsEnvCache?: NotificationsEnv;
  notificationsEnvFileValues?: Record<string, string>;
  notificationsEnvWarned?: boolean;
};

function loadEnvFileValues(): Record<string, string> {
  const envFilePath = join(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return {};
  }

  const fileContents = readFileSync(envFilePath, "utf8");
  const values: Record<string, string> = {};

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readEnv(name: string): string | undefined {
  globalForNotificationsEnv.notificationsEnvFileValues ??= loadEnvFileValues();

  // `process.env` first so a real environment value (or a CLI override such as
  // `scripts/run-digest.ts --scraper-url`) wins over the `.env` file, which is
  // the fallback. `$env/dynamic/private` is the last resort.
  const value =
    process.env[name] ??
    globalForNotificationsEnv.notificationsEnvFileValues[name] ??
    env[name as keyof typeof env];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value;
}

const positiveInt = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined) {
      return undefined;
    }

    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected a positive integer, received "${raw}"`,
      });
      return z.NEVER;
    }

    return parsed;
  });

// Accepts the usual truthy spellings; anything else (including unset) is false,
// except the fields that default to true below.
const booleanFlag = z
  .string()
  .optional()
  .transform((raw) => {
    if (raw === undefined) {
      return undefined;
    }

    return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
  });

const notificationsEnvSchema = z.object({
  SCRAPER_DATABASE_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: positiveInt.transform((value) => value ?? 587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: booleanFlag.transform((value) => value ?? false),
  NOTIFICATIONS_FROM_EMAIL: z.string().email().optional(),
  NOTIFICATIONS_CRON: z
    .string()
    .optional()
    .transform((value) => value ?? "0 6 * * *"),
  NOTIFICATIONS_BATCH_SIZE: positiveInt.transform((value) => value ?? 500),
  NOTIFICATIONS_ENABLED: booleanFlag.transform((value) => value ?? true),
});

export type NotificationsEnv = z.infer<typeof notificationsEnvSchema>;

function loadNotificationsEnv(): NotificationsEnv {
  const raw = {
    SCRAPER_DATABASE_URL: readEnv("SCRAPER_DATABASE_URL"),
    SMTP_HOST: readEnv("SMTP_HOST"),
    SMTP_PORT: readEnv("SMTP_PORT"),
    SMTP_USER: readEnv("SMTP_USER"),
    SMTP_PASSWORD: readEnv("SMTP_PASSWORD"),
    SMTP_SECURE: readEnv("SMTP_SECURE"),
    NOTIFICATIONS_FROM_EMAIL: readEnv("NOTIFICATIONS_FROM_EMAIL"),
    NOTIFICATIONS_CRON: readEnv("NOTIFICATIONS_CRON"),
    NOTIFICATIONS_BATCH_SIZE: readEnv("NOTIFICATIONS_BATCH_SIZE"),
    NOTIFICATIONS_ENABLED: readEnv("NOTIFICATIONS_ENABLED"),
  };

  const result = notificationsEnvSchema.safeParse(raw);

  if (!result.success) {
    console.warn(
      "[notifications] Invalid env configuration; falling back to defaults.",
      result.error.flatten().fieldErrors,
    );
    return notificationsEnvSchema.parse({});
  }

  return result.data;
}

export function getNotificationsEnv(): NotificationsEnv {
  globalForNotificationsEnv.notificationsEnvCache ??= loadNotificationsEnv();
  return globalForNotificationsEnv.notificationsEnvCache;
}

/**
 * Whether the queue can be read: enabled and a scraper DB to read from. This is
 * all a dry run needs (it never sends mail). A real run additionally requires
 * `hasNotificationsTransport()`.
 */
export function hasQueueSource(): boolean {
  const config = getNotificationsEnv();

  return Boolean(config.NOTIFICATIONS_ENABLED && config.SCRAPER_DATABASE_URL);
}

/**
 * Whether the digest job has everything it needs to run: enabled, a scraper DB
 * to read the queue from, and an SMTP host + sender to email through. The
 * scheduler and the manual-trigger route both gate on this and log a clear
 * reason when it is false, rather than throwing.
 */
export function hasNotificationsTransport(): boolean {
  const config = getNotificationsEnv();

  return Boolean(
    hasQueueSource() && config.SMTP_HOST && config.NOTIFICATIONS_FROM_EMAIL,
  );
}

export function resetNotificationsEnvForTesting(): void {
  globalForNotificationsEnv.notificationsEnvCache = undefined;
  globalForNotificationsEnv.notificationsEnvFileValues = undefined;
  globalForNotificationsEnv.notificationsEnvWarned = undefined;
}
