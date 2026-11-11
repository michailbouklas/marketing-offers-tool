import { getDataQualityEnv } from "$lib/server/env";
import {
  buildGapQueueCacheKey,
  invalidateGapQueueCache,
  withGapQueueCache,
} from "$lib/server/gap-queue-cache.server";
import { tryRebuildGapQueueSnapshotExclusively } from "$lib/services/gap-queue-snapshot.server";
import {
  getCurrentDimOfferValues,
  getDimOfferAuditSnapshot,
  getDimOffersByItemCodes,
  getOfferEligibleItemCodes,
  getTransactionItemContext,
  getTransactionItemContexts,
  insertDimOffer,
  updateDimOffer,
} from "$lib/services/offers-data-quality-clickhouse.server";
import { createDimOffersAuditRecord } from "$lib/services/dim-offers-audit.server";
import { getBrandPricingTargetByAlias } from "$lib/services/brands.server";
import {
  createGapRecord,
  getGapRecordById,
  getGapRecordByItemCode,
  getGapRecordsByIds,
  getPendingStagingRecordByItemCode,
  getStagingRecordById,
  getUserNamesByIds,
  listDismissedGapRecords,
  listPendingStagingRecords,
  listPriceFlaggedStagingRecords,
  countPendingStagingRecords,
  updateDimOffersStagingStatus,
  updateGapRecordStatus,
  type GapRecord,
} from "$lib/services/offers-data-quality-postgres.server";
import {
  getLatestSuccessfulSnapshotRefresh,
  getSnapshotRowByGapId,
  getSnapshotRowByItemCode,
  queryGapQueuePage,
  upsertSnapshotRow,
} from "$lib/services/offers-data-quality-snapshot.server";
import {
  emptyDimOfferValues,
  isMissingOfferPricing,
  normalizeBrandAlias,
} from "$lib/services/offers-data-quality-snapshot";
import {
  gapListSortDirections,
  gapListSortFields,
  getMissingFieldsFromCurrentValues,
  parseMissingFields,
  type GapFormLoadResponse,
  type GapListItem,
  type GapListPage,
  type GapListSortDirection,
  type GapListSortField,
  type PendingGapSubmission,
  type PendingSubmissionQueueItem,
} from "$lib/services/offers-data-quality";

type GetOpenGapListOptions = {
  brandAliases?: string[];
  sortBy?: GapListSortField;
  sortDir?: GapListSortDirection;
  statuses?: Array<GapListItem["status"]>;
  itemName?: string;
  itemCode?: string;
};

export type GapQueueStatus = {
  /** When the snapshot was last rebuilt successfully; null before the first run. */
  refreshedAt: string | null;
};

const globalForGapQueue = globalThis as typeof globalThis & {
  gapQueueSnapshotReady?: boolean;
};

function mapPendingSubmission(stagingRecord: {
  id: number;
  dq_id: number;
  item_code: string;
  channel: string;
  category: string;
  subcategory: string;
  ideal_price: { toFixed: (digits: number) => string };
  selling_price: { toFixed: (digits: number) => string };
  fc_perc: { toFixed: (digits: number) => string };
  fc_eur?: { toFixed: (digits: number) => string } | null;
  brand_ideal_fc_perc?: { toFixed: (digits: number) => string } | null;
  mktg_spend: { toFixed: (digits: number) => string } | null;
  notes: string | null;
  submitted_by: string;
  submitted_at: Date;
}): PendingGapSubmission {
  return {
    id: stagingRecord.id,
    dq_id: stagingRecord.dq_id,
    item_code: stagingRecord.item_code,
    channel: stagingRecord.channel,
    category: stagingRecord.category,
    subcategory: stagingRecord.subcategory,
    ideal_price: stagingRecord.ideal_price.toFixed(2),
    selling_price: stagingRecord.selling_price.toFixed(2),
    fc_perc: (Number(stagingRecord.fc_perc.toFixed(4)) * 100).toFixed(2),
    fc_eur: stagingRecord.fc_eur?.toFixed(2) ?? null,
    brand_ideal_fc_perc: stagingRecord.brand_ideal_fc_perc
      ? (Number(stagingRecord.brand_ideal_fc_perc.toFixed(4)) * 100).toFixed(2)
      : null,
    mktg_spend: stagingRecord.mktg_spend?.toFixed(2) ?? null,
    notes: stagingRecord.notes,
    submitted_by: stagingRecord.submitted_by,
    submitted_at: stagingRecord.submitted_at.toISOString(),
    status: "pending",
    flagged:
      Number(stagingRecord.selling_price.toFixed(2)) >
      Number(stagingRecord.ideal_price.toFixed(2)),
  };
}

export async function getGapFormData(
  dqId: number,
): Promise<GapFormLoadResponse | null> {
  const gapRecord = await getGapRecordById(dqId);

  if (!gapRecord) {
    return null;
  }

  // Item context comes from the snapshot when the gap is in the queue; only
  // gaps outside it (e.g. resolved ones) fall back to a ClickHouse lookup.
  const snapshotRow = await getSnapshotRowByGapId(gapRecord.dq_id);
  const [itemContext, currentDimOffers] = await Promise.all([
    snapshotRow
      ? Promise.resolve({
          item_name: snapshotRow.item_name,
          brand: snapshotRow.brand,
          item_category: snapshotRow.item_category,
        })
      : getTransactionItemContext(gapRecord.trde_item),
    getCurrentDimOfferValues(gapRecord.trde_item),
  ]);
  const brand = itemContext?.brand ?? gapRecord.brand;
  const brandTarget = await getBrandPricingTargetByAlias(brand);

  return {
    dq_id: gapRecord.dq_id,
    trde_item: gapRecord.trde_item,
    item_name: itemContext?.item_name ?? gapRecord.item_name,
    brand: brand.toUpperCase(),
    item_category: itemContext?.item_category ?? gapRecord.item_category,
    detected_at: gapRecord.detected_at.toISOString(),
    missing_fields: parseMissingFields(gapRecord.missing_fields),
    current_dim_offers: currentDimOffers,
    brand_target: brandTarget,
  };
}

export async function getPendingGapSubmission(
  itemCode: string,
): Promise<PendingGapSubmission | null> {
  const stagingRecord = await getPendingStagingRecordByItemCode(itemCode);

  if (!stagingRecord) {
    return null;
  }

  return mapPendingSubmission(stagingRecord);
}

/**
 * Cheap count of pending gap submissions for dashboard widgets. Counts pending
 * staging records directly rather than building the full queue.
 */
export async function getPendingGapSubmissionCount(): Promise<number> {
  return countPendingStagingRecords();
}

export async function getPendingGapSubmissionQueue(): Promise<
  PendingSubmissionQueueItem[]
> {
  const stagingRecords = await listPendingStagingRecords();

  if (stagingRecords.length === 0) {
    return [];
  }

  const itemCodes = [
    ...new Set(stagingRecords.map((record) => record.item_code)),
  ];
  const [gapRecords, itemContexts, dimOffers] = await Promise.all([
    getGapRecordsByIds([...new Set(stagingRecords.map((r) => r.dq_id))]),
    getTransactionItemContexts(itemCodes),
    getDimOffersByItemCodes(itemCodes),
  ]);
  const gapById = new Map(gapRecords.map((gap) => [gap.dq_id, gap]));
  const queueItems: PendingSubmissionQueueItem[] = [];

  for (const stagingRecord of stagingRecords) {
    const gapRecord = gapById.get(stagingRecord.dq_id);

    if (!gapRecord) {
      continue;
    }

    const itemContext = itemContexts.get(stagingRecord.item_code);

    queueItems.push({
      ...mapPendingSubmission(stagingRecord),
      item_name: itemContext?.item_name ?? gapRecord.item_name,
      brand: (itemContext?.brand ?? gapRecord.brand).toUpperCase(),
      item_category: itemContext?.item_category ?? gapRecord.item_category,
      detected_at: gapRecord.detected_at.toISOString(),
      missing_fields: parseMissingFields(gapRecord.missing_fields),
      current_dim_offers:
        dimOffers.get(stagingRecord.item_code) ?? emptyDimOfferValues,
    });
  }

  return queueItems;
}

/**
 * Resolve (or create) the gap record behind `/offers-data-quality/open/[itemCode]`.
 * After a rebuild every queue row has a gap record, so this is normally a
 * snapshot lookup; the on-demand detection below only runs for items that are
 * not in the snapshot yet (e.g. a link shared before the nightly rebuild).
 */
export async function ensureGapRecordForItemCode(
  itemCode: string,
): Promise<GapRecord | null> {
  const snapshotRow = await getSnapshotRowByItemCode(itemCode);

  if (snapshotRow) {
    const linkedGap = await getGapRecordById(snapshotRow.dq_id);

    if (linkedGap) {
      return linkedGap;
    }
  }

  const latestGap = await getGapRecordByItemCode(itemCode);

  // Removed from the list on purpose; an old shared link must not revive it.
  if (latestGap?.status === "dismissed") {
    return null;
  }

  if (latestGap && latestGap.status !== "resolved") {
    if (!snapshotRow) {
      await upsertSnapshotRow({
        trde_item: latestGap.trde_item,
        dq_id: latestGap.dq_id,
        item_name: latestGap.item_name,
        brand: latestGap.brand,
        brand_aliases: [normalizeBrandAlias(latestGap.brand)],
        item_category: latestGap.item_category,
        missing_fields: latestGap.missing_fields,
        status: latestGap.status,
        detected_at: latestGap.detected_at,
        current_dim_offers: emptyDimOfferValues,
        source: "on_demand",
      });
      invalidateGapQueueCache();
    }

    return latestGap;
  }

  const [eligibleItemCodes, itemContext, currentDimOffers] = await Promise.all([
    getOfferEligibleItemCodes([itemCode]),
    getTransactionItemContext(itemCode),
    getCurrentDimOfferValues(itemCode),
  ]);

  if (
    !eligibleItemCodes.has(itemCode) ||
    !isMissingOfferPricing(currentDimOffers)
  ) {
    return null;
  }

  const context = itemContext ?? latestGap;

  if (!context) {
    return null;
  }

  const createdGap = await createGapRecord({
    trde_item: itemCode,
    item_name: context.item_name,
    brand: context.brand,
    item_category: context.item_category,
    missing_fields:
      getMissingFieldsFromCurrentValues(currentDimOffers).join(","),
  });

  await upsertSnapshotRow({
    trde_item: createdGap.trde_item,
    dq_id: createdGap.dq_id,
    item_name: createdGap.item_name,
    brand: createdGap.brand,
    brand_aliases: [normalizeBrandAlias(createdGap.brand)],
    item_category: createdGap.item_category,
    missing_fields: createdGap.missing_fields,
    status: "open",
    detected_at: createdGap.detected_at,
    current_dim_offers: currentDimOffers,
    source: "on_demand",
  });
  invalidateGapQueueCache();

  return createdGap;
}

/**
 * Make sure the snapshot has been built at least once (first request after
 * the migration). Concurrent requests share the in-flight rebuild; if another
 * process holds the rebuild lock the caller just reads whatever exists.
 */
async function ensureGapQueueSnapshotBuilt(): Promise<void> {
  if (globalForGapQueue.gapQueueSnapshotReady) {
    return;
  }

  if (await getLatestSuccessfulSnapshotRefresh()) {
    globalForGapQueue.gapQueueSnapshotReady = true;
    return;
  }

  const result = await tryRebuildGapQueueSnapshotExclusively("cold_start");

  if (result.status === "ran") {
    globalForGapQueue.gapQueueSnapshotReady = true;
  }
}

export async function getGapQueueStatus(): Promise<GapQueueStatus> {
  const lastRefresh = await getLatestSuccessfulSnapshotRefresh();

  return {
    refreshedAt: lastRefresh?.finished_at?.toISOString() ?? null,
  };
}

export async function getOpenGapList(
  page = 1,
  pageSize = 50,
  options: GetOpenGapListOptions = {},
): Promise<GapListPage> {
  const sortBy =
    options.sortBy && gapListSortFields.includes(options.sortBy)
      ? options.sortBy
      : "brand";
  const sortDir =
    options.sortDir && gapListSortDirections.includes(options.sortDir)
      ? options.sortDir
      : "asc";
  const brandAliases = options.brandAliases?.map(normalizeBrandAlias);
  const statuses = options.statuses?.length ? options.statuses : undefined;
  const itemName = options.itemName?.trim() || undefined;
  const itemCode = options.itemCode?.trim() || undefined;

  await ensureGapQueueSnapshotBuilt();

  const cacheKey = buildGapQueueCacheKey({
    brandAliases: brandAliases ?? null,
    statuses: statuses ?? null,
    sortBy,
    sortDir,
    page,
    pageSize,
    itemName,
    itemCode,
  });

  return withGapQueueCache(
    cacheKey,
    getDataQualityEnv().DQ_QUEUE_CACHE_TTL_MS,
    () =>
      queryGapQueuePage({
        brandAliases,
        statuses,
        sortBy,
        sortDir,
        page,
        pageSize,
        itemName,
        itemCode,
      }),
  );
}

export async function approveGapSubmission(
  stagingId: number,
  approvedBy: string,
) {
  const stagingRecord = await getStagingRecordById(stagingId);

  if (!stagingRecord) {
    return null;
  }

  if (stagingRecord.status !== "pending") {
    throw new Error("Submission is not pending approval");
  }

  const gapRecord = await getGapRecordById(stagingRecord.dq_id);

  if (!gapRecord) {
    throw new Error("Gap record not found for staging submission");
  }

  // Flagged offers (selling > ideal) carry no discount rather than a negative one.
  const discountAmount = Math.max(
    0,
    Number.parseFloat(stagingRecord.ideal_price.toString()) -
      Number.parseFloat(stagingRecord.selling_price.toString()),
  ).toFixed(2);

  const upsertPayload = {
    item_code: stagingRecord.item_code,
    product_desc: gapRecord.item_name,
    brand: gapRecord.brand.trim(),
    channel: stagingRecord.channel,
    category: stagingRecord.category,
    subcategory: stagingRecord.subcategory,
    ideal_price: stagingRecord.ideal_price.toFixed(2),
    selling_price: stagingRecord.selling_price.toFixed(2),
    fc_perc: stagingRecord.fc_perc.toFixed(4),
    fc_eur: stagingRecord.fc_eur?.toFixed(2) ?? null,
    mktg_spend: stagingRecord.mktg_spend?.toFixed(2) ?? null,
    discount_amount: discountAmount,
    notes: stagingRecord.notes,
  };

  const currentDimOffer = await getDimOfferAuditSnapshot(
    stagingRecord.item_code,
  );
  const action = currentDimOffer ? "update" : "insert";
  const nextDimOffer = {
    item_code: upsertPayload.item_code,
    product_desc: upsertPayload.product_desc,
    brand_alias: upsertPayload.brand,
    channel: upsertPayload.channel,
    category: upsertPayload.category,
    subcategory: upsertPayload.subcategory,
    ideal_price: upsertPayload.ideal_price,
    selling_price: upsertPayload.selling_price,
    fc_perc: upsertPayload.fc_perc,
    fc_eur: upsertPayload.fc_eur,
    mktg_spend: upsertPayload.mktg_spend,
    discount_amount: upsertPayload.discount_amount,
  };

  if (currentDimOffer) {
    await updateDimOffer(upsertPayload);
  } else {
    await insertDimOffer(upsertPayload);
  }

  await createDimOffersAuditRecord({
    itemCode: stagingRecord.item_code,
    action,
    changedBy: approvedBy,
    stagingId: stagingRecord.id,
    dqId: stagingRecord.dq_id,
    beforeValues: currentDimOffer,
    afterValues: nextDimOffer,
  });
  await updateDimOffersStagingStatus(stagingRecord.id, "approved", approvedBy);
  await updateGapRecordStatus(stagingRecord.dq_id, "resolved");

  return stagingRecord;
}

/**
 * "Remove from list": permanently drop open gaps the user owns (by brand) from
 * the queue. Submitted gaps are refused so their pending staging record is
 * not orphaned; they go through reject instead.
 */
export async function dismissGaps(
  dqIds: number[],
  allowedBrandAliases: string[],
  userId: string,
): Promise<{
  processedIds: number[];
  failed: Array<{ id: number; error: string }>;
}> {
  const allowed = new Set(allowedBrandAliases.map(normalizeBrandAlias));
  const result = {
    processedIds: [] as number[],
    failed: [] as Array<{ id: number; error: string }>,
  };

  for (const dqId of new Set(dqIds)) {
    const row = await getSnapshotRowByGapId(dqId);

    if (!row || !row.brand_aliases.some((alias) => allowed.has(alias))) {
      result.failed.push({ id: dqId, error: "Gap not found in your queue" });
      continue;
    }

    if (row.status !== "open") {
      result.failed.push({
        id: dqId,
        error: "Awaiting approval; reject the submission instead",
      });
      continue;
    }

    try {
      await updateGapRecordStatus(dqId, "dismissed", userId);
      result.processedIds.push(dqId);
    } catch (error) {
      result.failed.push({
        id: dqId,
        error: error instanceof Error ? error.message : "Unable to remove gap",
      });
    }
  }

  return result;
}

export type FlaggedGap = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  missing_fields: string[];
  detected_at: string;
  dismissed_at: string | null;
  dismissed_by_name: string | null;
};

/** Gaps removed from the queue, limited to the user's brands. */
export async function listFlaggedGaps(
  allowedBrandAliases: string[],
): Promise<FlaggedGap[]> {
  const allowed = new Set(allowedBrandAliases.map(normalizeBrandAlias));
  const gaps = (await listDismissedGapRecords()).filter((gap) =>
    allowed.has(normalizeBrandAlias(gap.brand)),
  );
  const names = await getUserNamesByIds([
    ...new Set(
      gaps.flatMap((gap) => (gap.dismissed_by ? [gap.dismissed_by] : [])),
    ),
  ]);

  return gaps.map((gap) => ({
    dq_id: gap.dq_id,
    trde_item: gap.trde_item,
    item_name: gap.item_name,
    brand: gap.brand.trim().toUpperCase(),
    item_category: gap.item_category,
    missing_fields: parseMissingFields(gap.missing_fields),
    detected_at: gap.detected_at.toISOString(),
    dismissed_at: gap.resolved_at?.toISOString() ?? null,
    dismissed_by_name: gap.dismissed_by
      ? (names.get(gap.dismissed_by) ?? gap.dismissed_by)
      : null,
  }));
}

export type PriceFlaggedSubmission = {
  id: number;
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  selling_price: string;
  ideal_price: string;
  over_by: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  submitted_by_name: string;
};

/** Submissions with selling > ideal price, limited to the user's brands. */
export async function listPriceFlaggedSubmissions(
  allowedBrandAliases: string[],
): Promise<PriceFlaggedSubmission[]> {
  const allowed = new Set(allowedBrandAliases.map(normalizeBrandAlias));
  const records = (await listPriceFlaggedStagingRecords()).filter((record) =>
    allowed.has(normalizeBrandAlias(record.gap_record.brand)),
  );
  const names = await getUserNamesByIds([
    ...new Set(records.map((record) => record.submitted_by)),
  ]);

  return records.map((record) => ({
    id: record.id,
    dq_id: record.dq_id,
    trde_item: record.gap_record.trde_item,
    item_name: record.gap_record.item_name,
    brand: record.gap_record.brand.trim().toUpperCase(),
    selling_price: record.selling_price.toFixed(2),
    ideal_price: record.ideal_price.toFixed(2),
    over_by: record.selling_price.minus(record.ideal_price).toFixed(2),
    status: record.status,
    submitted_at: record.submitted_at.toISOString(),
    submitted_by_name: names.get(record.submitted_by) ?? record.submitted_by,
  }));
}

/** Put removed gaps back into the queue as open. */
export async function restoreGaps(
  dqIds: number[],
  allowedBrandAliases: string[],
): Promise<{
  processedIds: number[];
  failed: Array<{ id: number; error: string }>;
}> {
  const allowed = new Set(allowedBrandAliases.map(normalizeBrandAlias));
  const uniqueIds = [...new Set(dqIds)];
  const gapById = new Map(
    (await getGapRecordsByIds(uniqueIds)).map((gap) => [gap.dq_id, gap]),
  );
  const result = {
    processedIds: [] as number[],
    failed: [] as Array<{ id: number; error: string }>,
  };

  for (const dqId of uniqueIds) {
    const gap = gapById.get(dqId);

    if (
      !gap ||
      gap.status !== "dismissed" ||
      !allowed.has(normalizeBrandAlias(gap.brand))
    ) {
      result.failed.push({ id: dqId, error: "Removed gap not found" });
      continue;
    }

    try {
      await updateGapRecordStatus(dqId, "open");
      result.processedIds.push(dqId);
    } catch (error) {
      result.failed.push({
        id: dqId,
        error: error instanceof Error ? error.message : "Unable to restore gap",
      });
    }
  }

  return result;
}

export async function rejectGapSubmission(stagingId: number) {
  const stagingRecord = await getStagingRecordById(stagingId);

  if (!stagingRecord) {
    return null;
  }

  if (stagingRecord.status !== "pending") {
    throw new Error("Submission is not pending approval");
  }

  await updateDimOffersStagingStatus(stagingRecord.id, "rejected");
  await updateGapRecordStatus(stagingRecord.dq_id, "open");

  return stagingRecord;
}
