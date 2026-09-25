import { getDataQualityEnv } from "$lib/server/env";
import { invalidateGapQueueCache } from "$lib/server/gap-queue-cache.server";
import { tryAcquireAdvisoryLock } from "$lib/server/pg-advisory-lock";
import { prisma } from "$lib/server/prisma";
import {
  getDimOffersByItemCodes,
  listOfferEligibleItems,
  listTransactedOfferItems,
} from "$lib/services/offers-data-quality-clickhouse.server";
import {
  listGapRecords,
  listRecentlyResolvedItemCodes,
} from "$lib/services/offers-data-quality-postgres.server";
import {
  buildGapQueueSnapshotRows,
  type GapQueueSnapshotRowInput,
} from "$lib/services/offers-data-quality-snapshot";

/**
 * Nightly (and on-demand) rebuild of the gap-queue snapshot. This is the only
 * place the gap detection runs: three small ClickHouse queries, a pure merge,
 * then one Postgres transaction that
 *
 *   1. creates gap records for newly detected items (so every queue row has a
 *      real dq_id),
 *   2. resolves open gaps that are now priced or no longer eligible,
 *   3. refreshes item context on tracked gaps,
 *   4. swaps the snapshot contents, and
 *   5. reconciles against status changes that landed while ClickHouse was
 *      being queried.
 *
 * Runs are serialised across processes by a Postgres advisory lock and inside
 * a process by a shared in-flight promise (`tryRebuildGapQueueSnapshotExclusively`).
 */

export type GapQueueRebuildTrigger = "cron" | "manual" | "cli" | "cold_start";

export type GapQueueRebuildSummary = {
  trigger: GapQueueRebuildTrigger;
  dryRun: boolean;
  refreshId: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  detectedItems: number;
  createdGaps: number;
  resolvedGaps: number;
  contextUpdates: number;
  snapshotRows: number;
};

export type GapQueueRebuildResult =
  | { status: "ran"; summary: GapQueueRebuildSummary }
  | { status: "skipped"; reason: string };

// Two arbitrary int4 constants identifying the cross-process rebuild lock.
const LOCK_KEY_1 = 0x4471_4761 | 0; // "DqGa"
const LOCK_KEY_2 = 0x5265_6264 | 0; // "Rebd"
const WRITE_CHUNK_SIZE = 1000;
const TRANSACTION_TIMEOUT_MS = 120_000;

const globalForRebuild = globalThis as typeof globalThis & {
  gapQueueRebuildInFlight?: Promise<GapQueueRebuildResult>;
};

function chunk<T>(values: T[], size = WRITE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function toSnapshotCreateInput(
  row: GapQueueSnapshotRowInput,
  refreshedAt: Date,
) {
  if (row.dq_id === null || row.detected_at === null) {
    throw new Error(
      `Snapshot row for ${row.trde_item} has no gap record after creation`,
    );
  }

  return {
    trde_item: row.trde_item,
    dq_id: row.dq_id,
    item_name: row.item_name,
    brand: row.brand,
    brand_aliases: row.brand_aliases,
    item_category: row.item_category,
    missing_fields: row.missing_fields,
    status: row.status,
    detected_at: row.detected_at,
    channel: row.current_dim_offers.channel,
    category: row.current_dim_offers.category,
    subcategory: row.current_dim_offers.subcategory,
    ideal_price: row.current_dim_offers.ideal_price,
    selling_price: row.current_dim_offers.selling_price,
    fc_perc: row.current_dim_offers.fc_perc,
    mktg_spend: row.current_dim_offers.mktg_spend,
    source: row.source,
    refreshed_at: refreshedAt,
  };
}

/**
 * Run one rebuild. Returns `skipped` when another process holds the lock.
 * `dryRun` performs the ClickHouse phase and the merge, reports the counts and
 * writes nothing (no refresh row either).
 */
export async function rebuildGapQueueSnapshot(options: {
  trigger: GapQueueRebuildTrigger;
  dryRun?: boolean;
}): Promise<GapQueueRebuildResult> {
  const dryRun = options.dryRun ?? false;
  const lock = await tryAcquireAdvisoryLock(LOCK_KEY_1, LOCK_KEY_2);

  if (!lock) {
    return {
      status: "skipped",
      reason: "another process is already rebuilding the gap queue",
    };
  }

  const startedAt = new Date();
  const refresh = dryRun
    ? null
    : await prisma.dq_gap_queue_refresh.create({
        data: {
          trigger: options.trigger,
          status: "running",
          started_at: startedAt,
        },
      });

  try {
    const graceHours = getDataQualityEnv().DQ_SNAPSHOT_RESOLVED_GRACE_HOURS;
    const [eligibleItems, transactedItems, trackedGaps, recentlyResolved] =
      await Promise.all([
        listOfferEligibleItems(),
        listTransactedOfferItems(),
        listGapRecords({ statuses: ["open", "submitted"] }),
        listRecentlyResolvedItemCodes(graceHours),
      ]);
    const itemCodes = [
      ...new Set([
        ...transactedItems.map((item) => item.trde_item),
        ...trackedGaps.map((gap) => gap.trde_item),
      ]),
    ];
    const dimOffers = await getDimOffersByItemCodes(itemCodes);
    const merge = buildGapQueueSnapshotRows({
      eligibleItems,
      transactedItems,
      dimOffers,
      trackedGaps,
      recentlyResolvedItemCodes: recentlyResolved,
    });
    const toCreate = merge.rows.filter((row) => row.dq_id === null);
    const now = new Date();

    if (!dryRun) {
      await prisma.$transaction(
        async (tx) => {
          for (const batch of chunk(toCreate)) {
            const created =
              await tx.dq_missing_offers_pricing.createManyAndReturn({
                data: batch.map((row) => ({
                  trde_item: row.trde_item,
                  item_name: row.item_name,
                  brand: row.brand,
                  item_category: row.item_category,
                  missing_fields: row.missing_fields,
                  detected_at: now,
                  status: "open" as const,
                })),
              });
            const createdByItem = new Map(
              created.map((record) => [record.trde_item, record]),
            );

            for (const row of batch) {
              const record = createdByItem.get(row.trde_item);

              if (record) {
                row.dq_id = record.dq_id;
                row.detected_at = record.detected_at;
              }
            }
          }

          if (merge.resolveGapIds.length > 0) {
            await tx.dq_missing_offers_pricing.updateMany({
              where: {
                dq_id: { in: merge.resolveGapIds },
                status: "open",
              },
              data: {
                status: "resolved",
                resolved_at: now,
              },
            });
          }

          for (const update of merge.gapContextUpdates) {
            await tx.dq_missing_offers_pricing.update({
              where: { dq_id: update.dq_id },
              data: {
                item_name: update.item_name,
                brand: update.brand,
                item_category: update.item_category,
              },
            });
          }

          await tx.dq_gap_queue_snapshot.deleteMany({});

          for (const batch of chunk(merge.rows)) {
            await tx.dq_gap_queue_snapshot.createMany({
              data: batch.map((row) => toSnapshotCreateInput(row, now)),
            });
          }

          // Status changes that landed while ClickHouse was being queried.
          await tx.$executeRaw`
            UPDATE dq_gap_queue_snapshot AS s
            SET status = g.status
            FROM dq_missing_offers_pricing AS g
            WHERE g.dq_id = s.dq_id
              AND g.status <> 'resolved'
              AND g.status <> s.status
          `;
          await tx.$executeRaw`
            DELETE FROM dq_gap_queue_snapshot AS s
            USING dq_missing_offers_pricing AS g
            WHERE g.dq_id = s.dq_id
              AND g.status = 'resolved'
          `;
        },
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
      );
    }

    const finishedAt = new Date();
    const summary: GapQueueRebuildSummary = {
      trigger: options.trigger,
      dryRun,
      refreshId: refresh?.id ?? null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      detectedItems: merge.rows.length,
      createdGaps: toCreate.length,
      resolvedGaps: merge.resolveGapIds.length,
      contextUpdates: merge.gapContextUpdates.length,
      snapshotRows: merge.rows.length,
    };

    if (refresh) {
      await prisma.dq_gap_queue_refresh.update({
        where: { id: refresh.id },
        data: {
          status: "succeeded",
          finished_at: finishedAt,
          duration_ms: summary.durationMs,
          detected_items: summary.detectedItems,
          created_gaps: summary.createdGaps,
          resolved_gaps: summary.resolvedGaps,
          snapshot_rows: summary.snapshotRows,
        },
      });
    }

    return { status: "ran", summary };
  } catch (error) {
    if (refresh) {
      const finishedAt = new Date();

      await prisma.dq_gap_queue_refresh
        .update({
          where: { id: refresh.id },
          data: {
            status: "failed",
            finished_at: finishedAt,
            duration_ms: finishedAt.getTime() - startedAt.getTime(),
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    if (!dryRun) {
      invalidateGapQueueCache();
    }

    await lock.release();
  }
}

/**
 * Run a rebuild unless one is already in flight in this process, in which
 * case the caller awaits that run instead. Shared by the cron, the admin
 * trigger, the CLI and the cold-start path.
 */
export function tryRebuildGapQueueSnapshotExclusively(
  trigger: GapQueueRebuildTrigger,
): Promise<GapQueueRebuildResult> {
  if (globalForRebuild.gapQueueRebuildInFlight) {
    return globalForRebuild.gapQueueRebuildInFlight;
  }

  const run = rebuildGapQueueSnapshot({ trigger }).finally(() => {
    globalForRebuild.gapQueueRebuildInFlight = undefined;
  });

  globalForRebuild.gapQueueRebuildInFlight = run;

  return run;
}

export function isGapQueueRebuildInFlight(): boolean {
  return Boolean(globalForRebuild.gapQueueRebuildInFlight);
}
