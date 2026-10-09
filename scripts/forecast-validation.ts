/**
 * CLI for forecast validation runs (see docs/forecast-service.md, "Validation
 * runs" and `src/lib/services/forecasts/forecast-validation.server.ts`).
 *
 * Run via vite-node so SvelteKit's `$lib` / `$env` / `$app` modules resolve:
 *
 *   bun run forecast:validate                       # record all active brands × all models, N = FORECAST_VALIDATION_DEFAULT_DAYS
 *   bun run forecast:validate -- --days 14          # any window from 1 to 90 days
 *   bun run forecast:validate -- --brand bk,kfc --models seasonal_trend,calendar_boost
 *   bun run forecast:validate -- --dry-run          # run the engine and report, write nothing
 *   bun run forecast:validate -- evaluate           # score every due run now (what the daily cron does)
 *   bun run forecast:validate -- evaluate --dry-run
 *
 * The recorded forecasts are evaluated N days later by the in-process cron
 * (`FORECAST_VALIDATION_CRON`); run `evaluate` from an external scheduler
 * instead when that cron is disabled (`FORECAST_VALIDATION_ENABLED=false`).
 *
 * Exit codes: 0 ok · 1 unexpected error · 2 bad arguments · 3 another process
 * holds the lock · 4 nothing could be recorded (every brand × model failed).
 */

import { getForecastValidationEnv } from "$lib/server/env";
import {
  evaluateDueForecastValidationRuns,
  ForecastValidationInputError,
  recordForecastValidationRuns,
} from "$lib/services/forecasts/forecast-validation.server";

interface CliOptions {
  command: "record" | "evaluate";
  days: number | null;
  brands: string[] | undefined;
  models: string[] | undefined;
  dryRun: boolean;
  help: boolean;
}

const HELP = `Record forecasts for later validation, or score the ones that are due.

Usage: bun run forecast:validate [options]              record forecasts
       bun run forecast:validate evaluate [options]     evaluate due runs

Record options:
  -d, --days <n>        Forecast window in days (1-90). Default: FORECAST_VALIDATION_DEFAULT_DAYS (7).
  -b, --brand <a,b>     Only these brand aliases (default: every active brand with an alias).
  -m, --models <x,y>    Only these model ids (default: every model in the engine catalog).

Common options:
  -n, --dry-run         Do everything except write to the database.
  -h, --help            Show this help.
`;

function splitList(value: string | undefined, flag: string): string[] {
  if (value === undefined) {
    fail(`Missing value for ${flag}.`);
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fail(message: string): never {
  console.error(`${message}\n`);
  console.error(HELP);
  process.exit(2);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "record",
    days: null,
    brands: undefined,
    models: undefined,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] =
      arg.startsWith("--") && arg.includes("=")
        ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
        : [arg, undefined];
    const takeValue = (): string | undefined => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      index += 1;
      return argv[index];
    };

    if (index === 0 && (arg === "evaluate" || arg === "record")) {
      options.command = arg;
    } else if (flag === "--days" || flag === "-d") {
      const raw = takeValue();
      const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
        fail(`--days must be an integer between 1 and 90, got "${raw ?? ""}".`);
      }
      options.days = parsed;
    } else if (flag === "--brand" || flag === "--brands" || flag === "-b") {
      options.brands = splitList(takeValue(), flag);
    } else if (flag === "--models" || flag === "--model" || flag === "-m") {
      options.models = splitList(takeValue(), flag);
    } else if (flag === "--dry-run" || flag === "-n") {
      options.dryRun = true;
    } else if (flag === "--help" || flag === "-h") {
      options.help = true;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (
    options.command === "evaluate" &&
    (options.days !== null || options.brands || options.models)
  ) {
    fail("--days, --brand and --models only apply when recording.");
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);
    return;
  }

  const prefix = options.dryRun ? "[dry-run] " : "";

  if (options.command === "evaluate") {
    const result = await evaluateDueForecastValidationRuns({
      trigger: "cli",
      dryRun: options.dryRun,
    });

    if (result.status === "skipped") {
      console.error(
        `[forecast-validation] evaluation skipped: ${result.reason}`,
      );
      process.exit(3);
    }

    console.log(
      `${prefix}forecast validation evaluation result:`,
      JSON.stringify(result.summary, null, 2),
    );
    return;
  }

  const horizonDays =
    options.days ?? getForecastValidationEnv().FORECAST_VALIDATION_DEFAULT_DAYS;
  const result = await recordForecastValidationRuns({
    horizonDays,
    brandAliases: options.brands,
    modelIds: options.models,
    trigger: "cli",
    dryRun: options.dryRun,
  });

  if (result.status === "skipped") {
    console.error(`[forecast-validation] recording skipped: ${result.reason}`);
    process.exit(3);
  }

  console.log(
    `${prefix}forecast validation recording result:`,
    JSON.stringify(result.summary, null, 2),
  );

  const { recorded, duplicates, skipped, failed } = result.summary;
  if (recorded + duplicates + skipped === 0 && failed > 0) {
    console.error(
      "[forecast-validation] every brand × model pair failed — is the forecast engine running?",
    );
    process.exit(4);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    if (error instanceof ForecastValidationInputError) {
      console.error(`[forecast-validation] ${error.message}`);
      process.exit(2);
    }
    console.error("[forecast-validation] CLI failed:", error);
    process.exit(1);
  });
