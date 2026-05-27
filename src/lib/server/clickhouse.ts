import { env } from "$env/dynamic/private";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createLazyProxy } from "./lazy-proxy";

const globalForClickHouse = globalThis as typeof globalThis & {
  clickhouse?: ClickHouseClient;
  clickhouseConfigKey?: string;
  clickhouseEnvFileValues?: Record<string, string>;
};

function loadEnvFileValues() {
  const envFilePath = join(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return {} as Record<string, string>;
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

function parseRequestTimeout(value: string | undefined) {
  if (!value) {
    return 30000;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function getRequiredEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getEnvValue(name: string) {
  globalForClickHouse.clickhouseEnvFileValues ??= loadEnvFileValues();

  return (
    globalForClickHouse.clickhouseEnvFileValues[name] ??
    process.env[name] ??
    env[name as keyof typeof env]
  );
}

function getClickHouseConfig() {
  const url = getRequiredEnv(getEnvValue("CLICKHOUSE_URL"), "CLICKHOUSE_URL");
  const database = getEnvValue("CLICKHOUSE_DATABASE") || "default";
  const username = getEnvValue("CLICKHOUSE_USERNAME") || "default";
  const password = getEnvValue("CLICKHOUSE_PASSWORD") || "";
  const requestTimeout = parseRequestTimeout(
    getEnvValue("CLICKHOUSE_REQUEST_TIMEOUT_MS"),
  );

  return {
    url,
    database,
    username,
    password,
    requestTimeout,
  };
}

function getClickHouseConfigKey(
  config: ReturnType<typeof getClickHouseConfig>,
) {
  return JSON.stringify({
    url: config.url,
    database: config.database,
    username: config.username,
    password: config.password,
    requestTimeout: config.requestTimeout,
  });
}

// Credentials embedded in CLICKHOUSE_URL take precedence in @clickhouse/client
// and trigger an "overridden by a URL parameter" warning when username/password
// are also passed as options. Hoist any URL-embedded credentials into the
// explicit options (preserving that same precedence) and pass a clean URL so
// there is a single, authoritative source and no warning.
function resolveClickHouseCredentials(
  config: ReturnType<typeof getClickHouseConfig>,
) {
  const parsed = new URL(config.url);
  let { username, password } = config;

  if (parsed.username) {
    username = decodeURIComponent(parsed.username);
    parsed.username = "";
  }
  if (parsed.password) {
    password = decodeURIComponent(parsed.password);
    parsed.password = "";
  }

  const queryUser = parsed.searchParams.get("user");
  if (queryUser !== null) {
    username = queryUser;
    parsed.searchParams.delete("user");
  }
  const queryPassword = parsed.searchParams.get("password");
  if (queryPassword !== null) {
    password = queryPassword;
    parsed.searchParams.delete("password");
  }

  return { url: parsed.toString(), username, password };
}

function createClickHouseSingleton() {
  const config = getClickHouseConfig();
  const { url, username, password } = resolveClickHouseCredentials(config);

  return createClient({
    url,
    database: config.database,
    username,
    password,
    request_timeout: config.requestTimeout,
  });
}

function getClickHouseClient() {
  const clickHouseConfig = getClickHouseConfig();
  const clickHouseConfigKey = getClickHouseConfigKey(clickHouseConfig);

  if (
    globalForClickHouse.clickhouse &&
    globalForClickHouse.clickhouseConfigKey === clickHouseConfigKey
  ) {
    return globalForClickHouse.clickhouse;
  }

  const clickHouseClient = createClickHouseSingleton();
  globalForClickHouse.clickhouse = clickHouseClient;
  globalForClickHouse.clickhouseConfigKey = clickHouseConfigKey;

  return clickHouseClient;
}

export const clickhouse = createLazyProxy(getClickHouseClient);

export async function pingClickHouse() {
  return getClickHouseClient().ping();
}
