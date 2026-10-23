/**
 * CLI to run the page-view rollup + purge once (the same job the in-process
 * 04:30 cron runs). Use it after deploying the page-view migration to verify
 * the job, to catch up after downtime, or from an external scheduler (set
 * PAGE_VIEW_ROLLUP_ENABLED=false then).
 *
 * Run via vite-node so SvelteKit's `$lib` / `$env` / `$app` modules resolve:
 *
 *   bun run page-views:rollup
 *
 * Exit code is non-zero on error (or when another process holds the rollup
 * lock), so it is safe to use from cron/CI.
 */

import { runPageViewRollup } from "$lib/services/page-views/page-view-rollup.server";

const HELP = `Roll raw page views up into the daily tables and purge expired raw rows.

Usage: bun run page-views:rollup [options]

Options:
  -h, --help      Show this help.
`;

async function main(): Promise<void> {
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      return;
    }
    console.error(`Unknown argument: ${arg}\n`);
    console.error(HELP);
    process.exit(2);
  }

  const result = await runPageViewRollup("cli");

  if (result.status === "skipped") {
    console.error(`[page-views] rollup skipped: ${result.reason}`);
    process.exit(3);
  }

  console.log(
    "page-view rollup result:",
    JSON.stringify(result.summary, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[page-views] rollup CLI failed:", error);
    process.exit(1);
  });
