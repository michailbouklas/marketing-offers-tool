import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Env access for the Mastra module. Deliberately avoids SvelteKit's `$env/*`
 * virtual modules so everything under src/lib/server/mastra stays importable
 * by the standalone `mastra dev` playground (bun run mastra:dev) as well as
 * the SvelteKit server. process.env is populated by bun (dev), adapter-node
 * (prod), and `mastra dev --env .env`; the manual `.env` read is a fallback
 * for node-launched dev servers, mirroring src/lib/server/env.ts.
 */

const globalForAiChatEnv = globalThis as typeof globalThis & {
  aiChatEnvFileValues?: Record<string, string>;
};

function loadEnvFileValues(): Record<string, string> {
  const envFilePath = join(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const rawLine of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
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
  globalForAiChatEnv.aiChatEnvFileValues ??= loadEnvFileValues();

  // The project `.env` wins over process.env, matching the cascade in
  // src/lib/server/env.ts — machine-level env vars (e.g. a stale
  // CLICKHOUSE_URL pointing at localhost) must not shadow project config.
  const value =
    globalForAiChatEnv.aiChatEnvFileValues[name] ?? process.env[name];

  return value === undefined || value === null || value === ""
    ? undefined
    : value;
}

export interface AiChatEnv {
  /** OpenAI key shared with the image/text providers. */
  OPENAI_API_KEY: string | undefined;
  /** Model in Mastra router `provider/model` format. */
  AI_CHAT_MODEL: string;
}

export function getAiChatEnv(): AiChatEnv {
  const apiKey = readEnv("OPENAI_API_KEY");

  // Mastra's `openai/...` model strings look the key up on `process.env`.
  if (apiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = apiKey;
  }

  const model = readEnv("AI_CHAT_MODEL") ?? "openai/gpt-4o-mini";

  return {
    OPENAI_API_KEY: apiKey,
    // Mastra's router needs `provider/model`; tolerate a bare model name.
    AI_CHAT_MODEL: model.includes("/") ? model : `openai/${model}`,
  };
}

/** Same PostgreSQL database the app's Prisma client points at. */
export function getDatabaseUrl(): string {
  const url = readEnv("DATABASE_URL");

  if (!url) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  return url;
}

/**
 * Supabase Storage config for the shared object store, mirroring
 * `getStorageEnv()` in src/lib/server/env.ts. When any value is missing the
 * store falls back to the local filesystem under {@link getUploadsDir}.
 */
export function getStorageEnv(): {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
} {
  return {
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_STORAGE_BUCKET: readEnv("SUPABASE_STORAGE_BUCKET"),
  };
}

/** Local-filesystem storage root; same default as the image-generator env. */
export function getUploadsDir(): string {
  return readEnv("UPLOADS_DIR") ?? "./uploads";
}

/** Path to the officecli binary; defaults to resolving via PATH. */
export function getOfficeCliPath(): string {
  return readEnv("OFFICECLI_PATH") ?? "officecli";
}

export interface AiChatClickhouseEnv {
  url: string;
  username: string;
  password: string;
  database: string;
}

/**
 * Same ClickHouse the analytics dashboards use; Mastra stores observability
 * data (AI traces/metrics) in its own mastra_* tables there. Returns null
 * when unconfigured so observability can fall back to Postgres.
 */
export function getClickhouseEnv(): AiChatClickhouseEnv | null {
  const url = readEnv("CLICKHOUSE_URL");

  if (!url) {
    return null;
  }

  return {
    url,
    username: readEnv("CLICKHOUSE_USERNAME") ?? "default",
    password: readEnv("CLICKHOUSE_PASSWORD") ?? "",
    database: readEnv("CLICKHOUSE_DATABASE") ?? "default",
  };
}

// The database name ends up interpolated into connection config; keep it a
// strict identifier so a malformed env value can never smuggle SQL, mirroring
// src/lib/server/google-reviews-db.ts.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * Same ClickHouse server as {@link getClickhouseEnv} but pointed at the
 * google-maps-scraper replica database, so the google-reviews SQL tool's
 * unqualified table names resolve there. Returns null when unconfigured so
 * the tool can fail soft at execute time.
 */
export function getGoogleReviewsClickhouseEnv(): AiChatClickhouseEnv | null {
  const base = getClickhouseEnv();

  if (!base) {
    return null;
  }

  const database =
    readEnv("CLICKHOUSE_GOOGLE_REVIEWS_DATABASE") ??
    "google_maps_scraper_replica";

  if (!IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      `Invalid CLICKHOUSE_GOOGLE_REVIEWS_DATABASE: must match ${IDENTIFIER_PATTERN}`,
    );
  }

  return { ...base, database };
}

/**
 * Same ClickHouse server as {@link getClickhouseEnv} but pointed at the
 * aggregator-scraper replica database, so the competition SQL tool's
 * unqualified table names resolve there. Reads the same env var the app's
 * competition dashboards use (src/lib/server/competition-db.ts) — one config
 * knob for both. Returns null when unconfigured so the tool can fail soft at
 * execute time.
 */
export function getCompetitionClickhouseEnv(): AiChatClickhouseEnv | null {
  const base = getClickhouseEnv();

  if (!base) {
    return null;
  }

  const database =
    readEnv("CLICKHOUSE_COMPETITION_DATABASE") ?? "aggregator_scraper_replica";

  if (!IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      `Invalid CLICKHOUSE_COMPETITION_DATABASE: must match ${IDENTIFIER_PATTERN}`,
    );
  }

  return { ...base, database };
}

/**
 * Same ClickHouse server as {@link getClickhouseEnv} but pointed at the
 * database holding the Novasero POS sales tables (transactions,
 * transaction_details), so the sales SQL tool's unqualified table names
 * resolve there. Returns null when unconfigured so the tool can fail soft at
 * execute time.
 */
export function getSalesClickhouseEnv(): AiChatClickhouseEnv | null {
  const base = getClickhouseEnv();

  if (!base) {
    return null;
  }

  const database = readEnv("CLICKHOUSE_SALES_DATABASE") ?? "default";

  if (!IDENTIFIER_PATTERN.test(database)) {
    throw new Error(
      `Invalid CLICKHOUSE_SALES_DATABASE: must match ${IDENTIFIER_PATTERN}`,
    );
  }

  return { ...base, database };
}
