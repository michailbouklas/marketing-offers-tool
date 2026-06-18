/**
 * CLI to run the offer-notification digest once, bypassing the HTTP endpoint
 * (and its session auth). Useful for testing and for wiring into an external
 * scheduler instead of the in-process cron.
 *
 * Run via vite-node so SvelteKit's `$lib` / `$env` / `$app` modules resolve:
 *
 *   bun run digest                       # send the digest now (advances the cursor)
 *   bun run digest --dry-run             # preview recipients; sends nothing; cursor untouched
 *   bun run digest --scraper-url=postgresql://user:pass@host:5432/aggregator_scraper
 *
 * Exit code is non-zero on error, so it is safe to use from cron/CI.
 *
 * `--scraper-url` sets `process.env.SCRAPER_DATABASE_URL`, which the notification
 * config reads ahead of the `.env` file, so it overrides any pinned value.
 */

import { runOfferDigest } from "$lib/services/notifications/offer-digest.server";

interface CliOptions {
  dryRun: boolean;
  scraperUrl?: string;
  help: boolean;
}

const HELP = `Run the offer-notification digest once.

Usage: bun run digest [options]

Options:
  -n, --dry-run            Match + consolidate and log who WOULD be emailed,
                           without sending mail or advancing the cursor.
      --scraper-url <url>  Override SCRAPER_DATABASE_URL for this run.
  -h, --help               Show this help.
`;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run" || arg === "-n") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--scraper-url=")) {
      options.scraperUrl = arg.slice("--scraper-url=".length);
    } else if (arg === "--scraper-url") {
      options.scraperUrl = argv[index + 1];
      index += 1;
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

  // Applied before runOfferDigest reads config (the config cache is populated
  // lazily on first read, not at import), so this override takes effect.
  if (options.scraperUrl) {
    process.env.SCRAPER_DATABASE_URL = options.scraperUrl;
  }

  const summary = await runOfferDigest({ dryRun: options.dryRun });

  console.log(
    `${options.dryRun ? "[dry-run] " : ""}digest result:`,
    JSON.stringify(summary, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[notifications] digest CLI failed:", error);
    process.exit(1);
  });
