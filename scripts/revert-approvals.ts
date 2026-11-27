/**
 * CLI to undo approved offers-data-quality submissions by staging id: deletes
 * each item's dim_offers row, audits it (action delete, source revert), marks
 * the submission rejected and reopens the gap on the Open pricing gaps queue.
 *
 *   bun run dq:revert-approvals -- --by you@company.com --dry-run 347 260
 *   bun run dq:revert-approvals -- --by you@company.com 347 260
 *
 * Exit code is non-zero when any id fails.
 */

import { prisma } from "$lib/server/prisma";
import { getDimOfferAuditSnapshot } from "$lib/services/offers-data-quality-clickhouse.server";
import { revertApprovedSubmission } from "$lib/services/offers-data-quality.server";

const HELP = `Send approved offers back to the Open pricing gaps queue.

Usage: bun run dq:revert-approvals -- --by <email> [--dry-run] <stagingId>...

Options:
  --by <email>    User recorded as the one who reverted (required).
  -n, --dry-run   Show what would change; write nothing.
  -h, --help      Show this help.
`;

function parseArgs(argv: string[]) {
  const options = { by: "", dryRun: false, help: false, ids: [] as number[] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--by") options.by = argv[++i] ?? "";
    else if (arg === "--dry-run" || arg === "-n") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (/^\d+$/.test(arg)) options.ids.push(Number(arg));
    else {
      console.error(`Unknown argument: ${arg}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return options;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.by || options.ids.length === 0) {
    console.log(HELP);
    return options.help ? 0 : 2;
  }

  const user = await prisma.user.findUnique({
    where: { email: options.by },
    select: { id: true },
  });
  if (!user) {
    console.error(`No user with email ${options.by}`);
    return 2;
  }

  const records = await prisma.dim_offers_staging.findMany({
    where: { id: { in: options.ids } },
    select: {
      id: true,
      status: true,
      item_code: true,
      fc_eur: true,
      gap_record: { select: { brand: true, item_name: true, status: true } },
    },
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  let failed = 0;

  for (const id of options.ids) {
    const record = byId.get(id);
    if (!record) {
      console.error(`#${id}: not found`);
      failed++;
      continue;
    }
    const label = `#${id} ${record.item_code} (${record.gap_record.brand.trim()}, ${record.gap_record.item_name})`;
    if (record.status !== "approved") {
      console.log(`${label}: skipped, submission is ${record.status}`);
      continue;
    }

    if (options.dryRun) {
      const dimOffer = await getDimOfferAuditSnapshot(record.item_code);
      console.log(
        `${label}: would delete dim_offers row (ideal ${dimOffer?.ideal_price ?? "none"}, FC EUR ${record.fc_eur ?? "none"}), reject submission, reopen gap (now ${record.gap_record.status})`,
      );
      continue;
    }

    try {
      await revertApprovedSubmission(id, user.id);
      console.log(`${label}: reverted, gap reopened`);
    } catch (error) {
      console.error(`${label}: FAILED`, error);
      failed++;
    }
  }

  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("[data-quality] revert CLI failed:", error);
    process.exit(1);
  });
