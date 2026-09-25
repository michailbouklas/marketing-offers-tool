/**
 * CLI to rebuild the offers data-quality gap-queue snapshot once, bypassing
 * the HTTP endpoint (and its session auth). Use it right after deploying the
 * snapshot migration, for troubleshooting, or from an external scheduler
 * instead of the in-process 04:00 cron (set DQ_SNAPSHOT_ENABLED=false then).
 *
 * Run via vite-node so SvelteKit's `$lib` / `$env` / `$app` modules resolve:
 *
 *   bun run dq:rebuild             # rebuild now (creates/resolves gap records)
 *   bun run dq:rebuild --dry-run   # run detection and report counts; write nothing
 *
 * Exit code is non-zero on error (or when another process holds the rebuild
 * lock), so it is safe to use from cron/CI.
 */

import { rebuildGapQueueSnapshot } from "$lib/services/gap-queue-snapshot.server";

interface CliOptions {
  dryRun: boolean;
  help: boolean;
}

const HELP = `Rebuild the offers data-quality gap-queue snapshot once.

Usage: bun run dq:rebuild [options]

Options:
  -n, --dry-run   Query ClickHouse + Postgres and report what WOULD change
                  (detected items, gaps to create/resolve) without writing.
  -h, --help      Show this help.
`;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false, help: false };

  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "-n") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      console.error(`Unknown argument: ${arg}\n`);
      console.error(HELP);
      process.exit(2);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);
    return;
  }

  const result = await rebuildGapQueueSnapshot({
    trigger: "cli",
    dryRun: options.dryRun,
  });

  if (result.status === "skipped") {
    console.error(`[data-quality] rebuild skipped: ${result.reason}`);
    process.exit(3);
  }

  console.log(
    `${options.dryRun ? "[dry-run] " : ""}gap-queue rebuild result:`,
    JSON.stringify(result.summary, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[data-quality] rebuild CLI failed:", error);
    process.exit(1);
  });
