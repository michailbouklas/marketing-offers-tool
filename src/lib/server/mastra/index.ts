import { Mastra } from "@mastra/core";
import { MastraCompositeStore } from "@mastra/core/storage";
import {
  LocalFilesystem,
  Workspace,
  WORKSPACE_TOOLS,
} from "@mastra/core/workspace";
import { ClickhouseStoreVNext } from "@mastra/clickhouse";
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";
import { PostgresStore } from "@mastra/pg";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { competitionAgent } from "./agents/competition-agent";
import { forecastsAgent } from "./agents/forecasts-agent";
import { googleReviewsAgent } from "./agents/google-reviews-agent";
import { invoicesAgent } from "./agents/invoices-agent";
import { offersDataQualityAgent } from "./agents/offers-data-quality-agent";
import { salesAgent } from "./agents/sales-agent";
import { getAiChatEnv, getClickhouseEnv, getDatabaseUrl } from "./env";

const globalForMastra = globalThis as typeof globalThis & {
  mastraCache?: Mastra;
};

/**
 * Workspace files (skills) live next to the Mastra code. `vite dev` and
 * `node build` both run from the project root, but `mastra dev` runs its
 * bundle from .mastra/output — so walk upward until the directory is found.
 * Override with MASTRA_WORKSPACE_DIR when deploying the build elsewhere.
 */
function workspaceDir(): string {
  const override = process.env.MASTRA_WORKSPACE_DIR;

  if (override) {
    return override;
  }

  let dir = process.cwd();

  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = join(dir, "src", "lib", "server", "mastra", "workspace");

    if (existsSync(candidate)) {
      return candidate;
    }

    dir = dirname(dir);
  }

  return join(process.cwd(), "src", "lib", "server", "mastra", "workspace");
}

/**
 * Instance-level storage. Threads/messages/etc. live in Postgres (the same
 * "mastra" schema the agent memory uses); high-volume observability data
 * (AI traces + metrics) goes to ClickHouse when configured, falling back to
 * Postgres otherwise. Without instance storage Mastra keeps observability
 * in memory only — that is the "Metrics are not persisted" warning.
 */
function createStorage(): MastraCompositeStore {
  const postgres = new PostgresStore({
    id: "ai-chat-storage",
    connectionString: getDatabaseUrl(),
    schemaName: "mastra",
  });

  const clickhouse = getClickhouseEnv();

  if (!clickhouse) {
    console.warn(
      "[mastra] CLICKHOUSE_URL not set — observability data will be stored in Postgres.",
    );
    return postgres;
  }

  // VNext: the metrics-capable observability domain — the base ClickhouseStore
  // only persists spans, and Studio then reports "Metrics are not available
  // with your current storage".
  const clickhouseStore = new ClickhouseStoreVNext({
    id: "ai-chat-observability",
    url: clickhouse.url,
    username: clickhouse.username,
    password: clickhouse.password,
    database: clickhouse.database,
  });

  return new MastraCompositeStore({
    id: "ai-chat-composite",
    default: postgres,
    domains: { observability: clickhouseStore.stores?.observability },
  });
}

function createMastra(): Mastra {
  // Ensures OPENAI_API_KEY reaches process.env for Mastra's model router.
  getAiChatEnv();

  const workspace = new Workspace({
    filesystem: new LocalFilesystem({ basePath: workspaceDir() }),
    skills: ["skills"],
    // The workspace only distributes skills/reference files; agents must not
    // be able to modify it.
    tools: {
      [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: false },
      [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { enabled: false },
      [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { enabled: false },
      [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { enabled: false },
      [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { enabled: false },
    },
  });

  return new Mastra({
    workspace,
    agents: {
      "invoices-agent": invoicesAgent,
      "google-reviews-agent": googleReviewsAgent,
      "competition-agent": competitionAgent,
      "offers-data-quality-agent": offersDataQualityAgent,
      "sales-agent": salesAgent,
      "forecasts-agent": forecastsAgent,
    },
    storage: createStorage(),
    observability: new Observability({
      configs: {
        default: {
          serviceName: "marketing-offers-tool",
          exporters: [new MastraStorageExporter()],
          spanOutputProcessors: [new SensitiveDataFilter()],
        },
      },
    }),
    // Pins the `mastra dev` playground to a stable port. Without this the CLI
    // falls back to the PORT env var (3000 in .env — the SvelteKit prod port)
    // or scans from 4111, which other local Mastra projects may occupy. The
    // SvelteKit app ignores this setting entirely.
    server: { port: 4123 },
  });
}

/**
 * Shared Mastra instance, cached on globalThis so it survives dev HMR
 * (rebuilding on every reload would leak PostgresStore/pg pools). The flip
 * side: agent/memory config changes do NOT hot-reload — restart the dev
 * server after editing anything under src/lib/server/mastra.
 *
 * Only ever call this at request time — never at module scope. SvelteKit
 * imports server modules during `vite build` (no env/DB available, e.g. the
 * Docker builder stage), so constructing Mastra eagerly breaks the build.
 * The `mastra dev` playground gets its eager export from ./dev/index.ts.
 */
export function getMastra(): Mastra {
  globalForMastra.mastraCache ??= createMastra();
  return globalForMastra.mastraCache;
}
