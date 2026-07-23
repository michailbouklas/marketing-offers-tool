import {
  getCurrentDimOfferValues,
  getDimOfferAuditSnapshot,
  getOfferEligibleItemCodes,
  getTransactionItemContext,
  insertDimOffer,
  listMissingOfferQueueRows,
  updateDimOffer,
} from "$lib/services/offers-data-quality-clickhouse.server";
import { createDimOffersAuditRecord } from "$lib/services/dim-offers-audit.server";
import {
  createGapRecord,
  getGapRecordById,
  getGapRecordByItemCode,
  getPendingStagingRecordByItemCode,
  getStagingRecordById,
  listPendingStagingRecords,
  countPendingStagingRecords,
  listGapRecords,
  updateDimOffersStagingStatus,
  updateGapRecordStatus,
} from "$lib/services/offers-data-quality-postgres.server";
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
};

const statusSortOrder = new Map<GapListItem["status"], number>([
  ["open", 0],
  ["submitted", 1],
  ["resolved", 2],
]);

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function compareGapItems(
  left: GapListItem,
  right: GapListItem,
  sortBy: GapListSortField,
  sortDir: GapListSortDirection,
) {
  let comparison = 0;

  switch (sortBy) {
    case "item_name":
      comparison = compareText(left.item_name, right.item_name);
      break;
    case "brand":
      comparison = compareText(left.brand, right.brand);
      break;
    case "item_category":
      comparison = compareText(left.item_category, right.item_category);
      break;
    case "missing_fields":
      comparison = compareText(
        left.missing_fields.join(","),
        right.missing_fields.join(","),
      );
      break;
    case "status":
      comparison =
        (statusSortOrder.get(left.status) ?? Number.MAX_SAFE_INTEGER) -
        (statusSortOrder.get(right.status) ?? Number.MAX_SAFE_INTEGER);
      break;
    case "detected_at":
      comparison = compareText(left.detected_at, right.detected_at);
      break;
  }

  if (comparison !== 0) {
    return sortDir === "desc" ? -comparison : comparison;
  }

  const brandComparison = compareText(left.brand, right.brand);

  if (brandComparison !== 0) {
    return brandComparison;
  }

  const detectedAtComparison = right.detected_at.localeCompare(
    left.detected_at,
  );

  if (detectedAtComparison !== 0) {
    return detectedAtComparison;
  }

  const itemNameComparison = compareText(left.item_name, right.item_name);

  if (itemNameComparison !== 0) {
    return itemNameComparison;
  }

  return compareText(left.trde_item, right.trde_item);
}

function normalizeBrandAlias(value: string) {
  return value.trim().toLowerCase();
}

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
    mktg_spend: stagingRecord.mktg_spend?.toFixed(2) ?? null,
    notes: stagingRecord.notes,
    submitted_by: stagingRecord.submitted_by,
    submitted_at: stagingRecord.submitted_at.toISOString(),
    status: "pending",
  };
}

export async function getGapFormData(
  dqId: number,
): Promise<GapFormLoadResponse | null> {
  const gapRecord = await getGapRecordById(dqId);

  if (!gapRecord) {
    return null;
  }

  const [itemContext, currentDimOffers] = await Promise.all([
    getTransactionItemContext(gapRecord.trde_item),
    getCurrentDimOfferValues(gapRecord.trde_item),
  ]);

  return {
    dq_id: gapRecord.dq_id,
    trde_item: gapRecord.trde_item,
    item_name: itemContext?.item_name ?? gapRecord.item_name,
    brand: (itemContext?.brand ?? gapRecord.brand).toUpperCase(),
    item_category: itemContext?.item_category ?? gapRecord.item_category,
    detected_at: gapRecord.detected_at.toISOString(),
    missing_fields: parseMissingFields(gapRecord.missing_fields),
    current_dim_offers: currentDimOffers,
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
 * staging records directly rather than building the full queue (which fetches
 * gap/item/dim context per record via `getPendingGapSubmissionQueue`).
 */
export async function getPendingGapSubmissionCount(): Promise<number> {
  return countPendingStagingRecords();
}

export async function getPendingGapSubmissionQueue(): Promise<
  PendingSubmissionQueueItem[]
> {
  const stagingRecords = await listPendingStagingRecords();
  const queueItems = await Promise.all(
    stagingRecords.map(async (stagingRecord) => {
      const [gapRecord, itemContext, currentDimOffers] = await Promise.all([
        getGapRecordById(stagingRecord.dq_id),
        getTransactionItemContext(stagingRecord.item_code),
        getCurrentDimOfferValues(stagingRecord.item_code),
      ]);

      if (!gapRecord) {
        return null;
      }

      return {
        ...mapPendingSubmission(stagingRecord),
        item_name: itemContext?.item_name ?? gapRecord.item_name,
        brand: (itemContext?.brand ?? gapRecord.brand).toUpperCase(),
        item_category: itemContext?.item_category ?? gapRecord.item_category,
        detected_at: gapRecord.detected_at.toISOString(),
        missing_fields: parseMissingFields(gapRecord.missing_fields),
        current_dim_offers: currentDimOffers,
      } satisfies PendingSubmissionQueueItem;
    }),
  );

  return queueItems.filter(
    (queueItem): queueItem is PendingSubmissionQueueItem => queueItem !== null,
  );
}

export async function ensureGapRecordForItemCode(itemCode: string) {
  const existingGapRecord = await getGapRecordByItemCode(itemCode);

  if (existingGapRecord) {
    return existingGapRecord;
  }

  const clickhouseRow = (await listMissingOfferQueueRows()).find(
    (row) => row.trde_item === itemCode,
  );

  if (!clickhouseRow) {
    return null;
  }

  return createGapRecord({
    trde_item: clickhouseRow.trde_item,
    item_name: clickhouseRow.item_name,
    brand: clickhouseRow.brand,
    item_category: clickhouseRow.item_category,
    missing_fields: getMissingFieldsFromCurrentValues(
      clickhouseRow.current_dim_offers,
    ).join(","),
  });
}

export async function getOpenGapList(
  page = 1,
  pageSize = 50,
  options: GetOpenGapListOptions = {},
): Promise<GapListPage> {
  const sortBy = gapListSortFields.includes(options.sortBy ?? "item_name")
    ? (options.sortBy ?? "brand")
    : "brand";
  const sortDir = gapListSortDirections.includes(options.sortDir ?? "asc")
    ? (options.sortDir ?? "asc")
    : "asc";
  const hasBrandFilter = options.brandAliases !== undefined;
  const allowedBrandAliases = new Set(
    (options.brandAliases ?? []).map(normalizeBrandAlias).filter(Boolean),
  );
  const [trackedGaps, clickhouseRows] = await Promise.all([
    listGapRecords({ statuses: ["open", "submitted"] }),
    listMissingOfferQueueRows(
      hasBrandFilter ? { brandAliases: [...allowedBrandAliases] } : undefined,
    ),
  ]);

  const visibleTrackedGaps = trackedGaps.filter(
    (gap) =>
      !hasBrandFilter ||
      allowedBrandAliases.has(normalizeBrandAlias(gap.brand)),
  );

  const trackedGapByItemCode = new Map(
    visibleTrackedGaps.map((gap) => [gap.trde_item, gap]),
  );
  const queueItems: GapListItem[] = [];
  const fromClickhouse: string[] = [];
  const fromPgLeftover: string[] = [];

  for (const row of clickhouseRows) {
    const trackedGap = trackedGapByItemCode.get(row.trde_item);

    queueItems.push({
      dq_id: trackedGap?.dq_id ?? 0,
      trde_item: row.trde_item,
      item_name: row.item_name,
      brand: row.brand.toUpperCase(),
      item_category: row.item_category,
      detected_at:
        trackedGap?.detected_at.toISOString() ?? new Date().toISOString(),
      status: trackedGap?.status ?? "open",
      missing_fields: trackedGap
        ? parseMissingFields(trackedGap.missing_fields)
        : getMissingFieldsFromCurrentValues(row.current_dim_offers),
    });
    fromClickhouse.push(row.trde_item);

    trackedGapByItemCode.delete(row.trde_item);
  }

  const leftoverGaps = Array.from(trackedGapByItemCode.values());

  if (leftoverGaps.length > 0) {
    const offerEligibleItemCodes = await getOfferEligibleItemCodes(
      leftoverGaps.map((gap) => gap.trde_item),
    );

    for (const gap of leftoverGaps) {
      if (!offerEligibleItemCodes.has(gap.trde_item)) {
        continue;
      }

      queueItems.push({
        dq_id: gap.dq_id,
        trde_item: gap.trde_item,
        item_name: gap.item_name,
        brand: gap.brand.toUpperCase(),
        item_category: gap.item_category,
        detected_at: gap.detected_at.toISOString(),
        status: gap.status,
        missing_fields: parseMissingFields(gap.missing_fields),
      });
      fromPgLeftover.push(gap.trde_item);
    }
  }

  console.log(
    `[getOpenGapList] sources: clickhouse=${fromClickhouse.length} pgLeftover=${fromPgLeftover.length}`,
  );
  console.log(
    "[getOpenGapList] from clickhouse query:",
    JSON.stringify(fromClickhouse),
  );
  console.log(
    "[getOpenGapList] from pg-leftover (active in dim_items but not in CH result):",
    JSON.stringify(fromPgLeftover),
  );

  const sortedItems = queueItems.sort((left, right) =>
    compareGapItems(left, right, sortBy, sortDir),
  );

  console.log(
    `[getOpenGapList] brandFilter=${
      hasBrandFilter ? JSON.stringify([...allowedBrandAliases]) : "none"
    } (pushed to SQL) sortBy=${sortBy} sortDir=${sortDir} (applied JS-side over merged CH+PG set) totalItems=${sortedItems.length}`,
  );
  console.log(
    "[getOpenGapList] items:",
    JSON.stringify(
      sortedItems.map((item) => ({
        dq_id: item.dq_id,
        trde_item: item.trde_item,
        item_name: item.item_name,
        brand: item.brand,
        item_category: item.item_category,
        status: item.status,
      })),
      null,
      2,
    ),
  );

  // Count before the status filter so the "awaiting approval" badge reflects
  // the current brand filter even when the status filter is not applied.
  const submittedCount = sortedItems.filter(
    (item) => item.status === "submitted",
  ).length;
  const statusFilter = options.statuses?.length
    ? new Set(options.statuses)
    : null;
  const visibleItems = statusFilter
    ? sortedItems.filter((item) => statusFilter.has(item.status))
    : sortedItems;

  const totalItems = visibleItems.length;
  const normalizedPageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (normalizedPage - 1) * normalizedPageSize;

  return {
    items: visibleItems.slice(startIndex, startIndex + normalizedPageSize),
    totalItems,
    submittedCount,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages,
  };
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

  const discountAmount = (
    Number.parseFloat(stagingRecord.ideal_price.toString()) -
    Number.parseFloat(stagingRecord.selling_price.toString())
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
