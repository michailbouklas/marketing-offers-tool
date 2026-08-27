import { env } from "$env/dynamic/private";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const globalForEnv = globalThis as typeof globalThis & {
  imageGeneratorEnvCache?: ImageGeneratorEnv;
  imageGeneratorEnvFileValues?: Record<string, string>;
  imageGeneratorEnvWarned?: boolean;
};

/**
 * Strips an inline comment from a raw `.env` value, dotenv-style: a quoted
 * value ends at its closing quote (anything after it is ignored), an unquoted
 * value ends at the first ` #`. `#` inside quotes is preserved.
 */
function parseEnvFileValue(rawValue: string): string {
  const value = rawValue.trim();
  const quote =
    value.startsWith('"') || value.startsWith("'") ? value[0] : null;

  if (quote) {
    const closingIndex = value.indexOf(quote, 1);
    if (closingIndex > 0) {
      return value.slice(1, closingIndex);
    }
    return value;
  }

  const commentMatch = /\s#/.exec(value);
  return commentMatch ? value.slice(0, commentMatch.index).trim() : value;
}

/** Parses `.env` file contents into key/value pairs (exported for tests). */
export function parseEnvFileContents(
  fileContents: string,
): Record<string, string> {
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

    const key = line
      .slice(0, separatorIndex)
      .trim()
      .replace(/^export\s+/, "");
    values[key] = parseEnvFileValue(line.slice(separatorIndex + 1));
  }

  return values;
}

function loadEnvFileValues(): Record<string, string> {
  const envFilePath = join(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return {};
  }

  return parseEnvFileContents(readFileSync(envFilePath, "utf8"));
}

function readEnv(name: string): string | undefined {
  globalForEnv.imageGeneratorEnvFileValues ??= loadEnvFileValues();

  const value =
    globalForEnv.imageGeneratorEnvFileValues[name] ??
    process.env[name] ??
    env[name as keyof typeof env];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value;
}

const csvList = z
  .string()
  .optional()
  .transform((raw) =>
    raw
      ? raw
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [],
  );

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

const providerName = z.enum(["imagerouter", "openai"]);

const imageGeneratorEnvSchema = z.object({
  IMAGE_ROUTER_API_KEY: z.string().optional(),
  IMAGE_ROUTER_BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((value) => value ?? "https://api.imagerouter.io"),
  IMAGE_ROUTER_MODELS: csvList,
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_IMAGE_MODELS: csvList,
  DEFAULT_PROVIDER: providerName
    .optional()
    .transform((value) => value ?? "imagerouter"),
  DEFAULT_MODEL: z
    .string()
    .optional()
    .transform((value) => value ?? "gpt-image-1"),
  UPLOADS_DIR: z
    .string()
    .optional()
    .transform((value) => value ?? "./uploads"),
  SAMPLES_PER_MODEL_MAX: positiveInt.transform((value) => value ?? 5),
});

export type ImageGeneratorEnv = z.infer<typeof imageGeneratorEnvSchema>;

function loadImageGeneratorEnv(): ImageGeneratorEnv {
  const raw = {
    IMAGE_ROUTER_API_KEY: readEnv("IMAGE_ROUTER_API_KEY"),
    IMAGE_ROUTER_BASE_URL: readEnv("IMAGE_ROUTER_BASE_URL"),
    IMAGE_ROUTER_MODELS: readEnv("IMAGE_ROUTER_MODELS"),
    OPENAI_API_KEY: readEnv("OPENAI_API_KEY"),
    OPENAI_IMAGE_MODELS: readEnv("OPENAI_IMAGE_MODELS"),
    DEFAULT_PROVIDER: readEnv("DEFAULT_PROVIDER"),
    DEFAULT_MODEL: readEnv("DEFAULT_MODEL"),
    UPLOADS_DIR: readEnv("UPLOADS_DIR"),
    SAMPLES_PER_MODEL_MAX: readEnv("SAMPLES_PER_MODEL_MAX"),
  };

  const result = imageGeneratorEnvSchema.safeParse(raw);

  if (!result.success) {
    console.warn(
      "[image-generator] Invalid env configuration; falling back to defaults.",
      result.error.flatten().fieldErrors,
    );
    return imageGeneratorEnvSchema.parse({});
  }

  if (!globalForEnv.imageGeneratorEnvWarned) {
    if (!result.data.IMAGE_ROUTER_API_KEY) {
      console.warn(
        "[image-generator] IMAGE_ROUTER_API_KEY is not set — ImageRouter provider will be disabled.",
      );
    }
    if (!result.data.OPENAI_API_KEY) {
      console.warn(
        "[image-generator] OPENAI_API_KEY is not set — OpenAI provider and prompt enhancement will be disabled.",
      );
    }
    globalForEnv.imageGeneratorEnvWarned = true;
  }

  return result.data;
}

export function getImageGeneratorEnv(): ImageGeneratorEnv {
  globalForEnv.imageGeneratorEnvCache ??= loadImageGeneratorEnv();
  return globalForEnv.imageGeneratorEnvCache;
}

export function hasImageRouterProvider(): boolean {
  return Boolean(getImageGeneratorEnv().IMAGE_ROUTER_API_KEY);
}

export function hasOpenAIProvider(): boolean {
  return Boolean(getImageGeneratorEnv().OPENAI_API_KEY);
}

export function resetImageGeneratorEnvForTesting(): void {
  globalForEnv.imageGeneratorEnvCache = undefined;
  globalForEnv.imageGeneratorEnvFileValues = undefined;
  globalForEnv.imageGeneratorEnvWarned = undefined;
}

/**
 * Supabase Storage configuration for the shared object store. When all three
 * values are present the app stores image/reference/brand bytes in the
 * Supabase bucket (shared across every machine that talks to the same
 * database); when they are absent it falls back to local-filesystem storage
 * under `UPLOADS_DIR` (dev + tests). See `object-store.server.ts`.
 */
export interface StorageEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
}

export function getStorageEnv(): StorageEnv {
  return {
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_STORAGE_BUCKET: readEnv("SUPABASE_STORAGE_BUCKET"),
  };
}

export function hasSupabaseStorage(): boolean {
  const env = getStorageEnv();
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_STORAGE_BUCKET,
  );
}

/**
 * Base URL of the remote competition scraper server (POST /scrape and
 * /scrape-all). Returns `undefined` when unset so callers can surface a clear
 * configuration error. A missing protocol defaults to HTTP (for host:port
 * deployment values) and any trailing slash is trimmed so endpoint paths can be
 * concatenated directly.
 */
export function getRemoteScraperUrl(): string | undefined {
  const value = readEnv("REMOTE_SCRAPER_URL");

  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue);
  const absoluteUrl = hasProtocol ? trimmedValue : `http://${trimmedValue}`;

  return absoluteUrl.replace(/\/+$/, "");
}

/**
 * Configuration for the Open WebUI bridge — the OpenAI-compatible endpoint
 * under `/api/openai/v1` and the OpenAPI tool server under
 * `/api/openwebui-tools`. See `docs/openwebui-integration.md`.
 *
 * `OPENWEBUI_SHARED_SECRET` unset disables the bridge entirely (both route
 * families answer 503). Header names are compared lowercase (Fetch headers
 * are case-insensitive anyway).
 */
export interface OpenWebUiEnv {
  OPENWEBUI_SHARED_SECRET?: string;
  OPENWEBUI_USER_EMAIL_HEADER: string;
  OPENWEBUI_TASK_HEADER: string;
  OPENWEBUI_CHAT_ID_HEADER: string;
  /** Browser origins allowed to call the tool server directly (CORS). */
  OPENWEBUI_ORIGIN: string[];
  /** Wall-clock budget for one tool-server `ask-sales` call. */
  OPENWEBUI_ASK_TIMEOUT_MS: number;
  /** Public base URL used in the OpenAPI `servers[].url`; falls back to ORIGIN. */
  PUBLIC_BASE_URL?: string;
}

function readHeaderName(name: string, fallback: string): string {
  return (readEnv(name) ?? fallback).trim().toLowerCase();
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = readEnv(name);
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Configuration for the Sales Forecasts feature — the Python forecast sidecar
 * (`forecast-service/`) plus the ClickHouse lookback and server-side caches.
 * See `docs/forecast-service.md`.
 *
 * `FORECAST_SERVICE_URL` unset means the feature is not configured; callers
 * surface `NOT_CONFIGURED` rather than crashing. The URL is normalised like
 * `getRemoteScraperUrl` (protocol defaults to http://, trailing slash trimmed)
 * so endpoint paths can be concatenated directly.
 */
export interface ForecastEnv {
  FORECAST_SERVICE_URL?: string;
  /** Shared bearer secret; omitted header when empty (dev with FORECAST_ALLOW_NO_AUTH=1). */
  FORECAST_SERVICE_TOKEN?: string;
  /** Node-side wall-clock budget per engine call; keep above FORECAST_TIMEOUT_S * 1000. */
  FORECAST_TIMEOUT_MS: number;
  /** ClickHouse lookback (calendar days ending at the brand's latest sales date). */
  FORECAST_HISTORY_DAYS: number;
  /** TTL of the server-side forecast result cache. */
  FORECAST_CACHE_TTL_MS: number;
  /** TTL of the engine model-catalog cache. */
  FORECAST_MODELS_TTL_MS: number;
  /** ISO country code used for holiday calendars. */
  FORECAST_DEFAULT_COUNTRY: string;
  /** ClickHouse database holding the POS `transactions` table (identifier). */
  CLICKHOUSE_SALES_DATABASE: string;
}

function normaliseBaseUrl(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue);
  const absoluteUrl = hasProtocol ? trimmedValue : `http://${trimmedValue}`;

  return absoluteUrl.replace(/\/+$/, "");
}

export function getForecastEnv(): ForecastEnv {
  const token = readEnv("FORECAST_SERVICE_TOKEN")?.trim();
  const country = readEnv("FORECAST_DEFAULT_COUNTRY")?.trim().toUpperCase();
  const salesDatabase = readEnv("CLICKHOUSE_SALES_DATABASE")?.trim();

  return {
    FORECAST_SERVICE_URL: normaliseBaseUrl(readEnv("FORECAST_SERVICE_URL")),
    FORECAST_SERVICE_TOKEN: token ? token : undefined,
    FORECAST_TIMEOUT_MS: readPositiveInt("FORECAST_TIMEOUT_MS", 75_000),
    FORECAST_HISTORY_DAYS: readPositiveInt("FORECAST_HISTORY_DAYS", 1095),
    FORECAST_CACHE_TTL_MS: readPositiveInt("FORECAST_CACHE_TTL_MS", 21_600_000),
    FORECAST_MODELS_TTL_MS: readPositiveInt("FORECAST_MODELS_TTL_MS", 600_000),
    FORECAST_DEFAULT_COUNTRY: country ? country : "CY",
    CLICKHOUSE_SALES_DATABASE: salesDatabase ? salesDatabase : "default",
  };
}

/**
 * Test helper — drops the memoised `.env` file snapshot so the next
 * `getForecastEnv()` re-reads the environment. Values themselves are not
 * cached; only the `.env` file contents are (shared with the other getters).
 */
export function resetForecastEnvForTesting(): void {
  globalForEnv.imageGeneratorEnvFileValues = undefined;
}

export function getOpenWebUiEnv(): OpenWebUiEnv {
  const secret = readEnv("OPENWEBUI_SHARED_SECRET")?.trim();
  const baseUrl = (readEnv("PUBLIC_BASE_URL") ?? readEnv("ORIGIN"))?.trim();

  return {
    OPENWEBUI_SHARED_SECRET: secret ? secret : undefined,
    OPENWEBUI_USER_EMAIL_HEADER: readHeaderName(
      "OPENWEBUI_USER_EMAIL_HEADER",
      "x-openwebui-user-email",
    ),
    OPENWEBUI_TASK_HEADER: readHeaderName(
      "OPENWEBUI_TASK_HEADER",
      "x-openwebui-task",
    ),
    OPENWEBUI_CHAT_ID_HEADER: readHeaderName(
      "OPENWEBUI_CHAT_ID_HEADER",
      "x-openwebui-chat-id",
    ),
    OPENWEBUI_ORIGIN: (readEnv("OPENWEBUI_ORIGIN") ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter((origin) => origin.length > 0),
    OPENWEBUI_ASK_TIMEOUT_MS: readPositiveInt(
      "OPENWEBUI_ASK_TIMEOUT_MS",
      90_000,
    ),
    PUBLIC_BASE_URL: baseUrl ? baseUrl.replace(/\/+$/, "") : undefined,
  };
}
