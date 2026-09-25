import {
  getMissingFieldsFromCurrentValues,
  type CurrentDimOffersValues,
} from "$lib/services/offers-data-quality";

/**
 * Pure (browser-safe, no I/O) merge logic for the gap-queue snapshot rebuild.
 * Given the three ClickHouse result sets and the tracked Postgres gap records,
 * it decides which items belong in `dq_gap_queue_snapshot`, which tracked gaps
 * must be created or resolved in `dq_missing_offers_pricing`, and which
 * tracked gaps need their item context refreshed.
 */

export type GapQueueSnapshotSource = "transactions" | "tracked" | "on_demand";

export type OfferEligibleItem = {
  item_code: string;
  item_name: string;
  item_category: string;
};

export type TransactedOfferItem = {
  trde_item: string;
  /** Brand of the most recent sale (display brand). */
  brand: string;
  /** Every lower-cased brand the item was sold under (filtering). */
  brand_aliases: string[];
};

export type TrackedGapRecord = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  missing_fields: string;
  detected_at: Date;
  status: "open" | "submitted" | "resolved";
};

export type GapQueueSnapshotRowInput = {
  trde_item: string;
  /** `null` until the rebuild creates the gap record. */
  dq_id: number | null;
  item_name: string;
  brand: string;
  brand_aliases: string[];
  item_category: string;
  missing_fields: string;
  status: "open" | "submitted";
  /** `null` until the rebuild creates the gap record. */
  detected_at: Date | null;
  current_dim_offers: CurrentDimOffersValues;
  source: GapQueueSnapshotSource;
};

export type TrackedGapContextUpdate = {
  dq_id: number;
  item_name: string;
  brand: string;
  item_category: string;
};

export type BuildGapQueueSnapshotInput = {
  eligibleItems: Map<string, OfferEligibleItem>;
  transactedItems: TransactedOfferItem[];
  dimOffers: Map<string, CurrentDimOffersValues>;
  trackedGaps: TrackedGapRecord[];
  /** Items whose latest gap was resolved inside the grace window. */
  recentlyResolvedItemCodes: Set<string>;
};

export type BuildGapQueueSnapshotResult = {
  rows: GapQueueSnapshotRowInput[];
  /** Open gaps that are now priced or no longer eligible. */
  resolveGapIds: number[];
  /** Tracked gaps whose ClickHouse item context changed. */
  gapContextUpdates: TrackedGapContextUpdate[];
};

export const emptyDimOfferValues: CurrentDimOffersValues = {
  channel: null,
  category: null,
  subcategory: null,
  ideal_price: null,
  selling_price: null,
  fc_perc: null,
  mktg_spend: null,
};

export function normalizeBrandAlias(value: string): string {
  return value.trim().toLowerCase();
}

/** An item is missing pricing when it has no dim_offers row or no ideal price. */
export function isMissingOfferPricing(
  values: CurrentDimOffersValues | undefined,
): boolean {
  if (!values) {
    return true;
  }

  return values.ideal_price === null || values.ideal_price === 0;
}

function uniqueAliases(values: string[]): string[] {
  return [...new Set(values.map(normalizeBrandAlias).filter(Boolean))];
}

export function buildGapQueueSnapshotRows(
  input: BuildGapQueueSnapshotInput,
): BuildGapQueueSnapshotResult {
  const rows: GapQueueSnapshotRowInput[] = [];
  const resolveGapIds: number[] = [];
  const gapContextUpdates: TrackedGapContextUpdate[] = [];

  // First (most recent) active record per item wins; trackedGaps is expected
  // ordered by detected_at desc like listGapRecords returns it.
  const trackedByItem = new Map<string, TrackedGapRecord>();

  for (const gap of input.trackedGaps) {
    if (gap.status === "resolved" || trackedByItem.has(gap.trde_item)) {
      continue;
    }

    trackedByItem.set(gap.trde_item, gap);
  }

  const transactedByItem = new Map(
    input.transactedItems.map((item) => [item.trde_item, item]),
  );
  const seen = new Set<string>();

  for (const transacted of input.transactedItems) {
    const code = transacted.trde_item;

    if (seen.has(code)) {
      continue;
    }

    seen.add(code);

    const eligible = input.eligibleItems.get(code);

    if (!eligible) {
      continue;
    }

    const dimOffer = input.dimOffers.get(code);
    const tracked = trackedByItem.get(code);
    const missing = isMissingOfferPricing(dimOffer);

    if (!missing) {
      if (tracked?.status === "open") {
        resolveGapIds.push(tracked.dq_id);
      } else if (tracked?.status === "submitted") {
        // Awaiting approval: keep visible so the approver closes it out.
        rows.push(
          buildTrackedRow(tracked, {
            item_name: eligible.item_name,
            brand: transacted.brand,
            brand_aliases: transacted.brand_aliases,
            item_category: eligible.item_category,
            dimOffer,
            source: "transactions",
          }),
        );
        collectContextUpdate(gapContextUpdates, tracked, {
          item_name: eligible.item_name,
          brand: transacted.brand,
          item_category: eligible.item_category,
        });
      }

      continue;
    }

    if (!tracked && input.recentlyResolvedItemCodes.has(code)) {
      // Just approved; the async ClickHouse mutation has not landed yet.
      continue;
    }

    if (tracked) {
      rows.push(
        buildTrackedRow(tracked, {
          item_name: eligible.item_name,
          brand: transacted.brand,
          brand_aliases: transacted.brand_aliases,
          item_category: eligible.item_category,
          dimOffer,
          source: "transactions",
        }),
      );
      collectContextUpdate(gapContextUpdates, tracked, {
        item_name: eligible.item_name,
        brand: transacted.brand,
        item_category: eligible.item_category,
      });
      continue;
    }

    const currentValues = dimOffer ?? emptyDimOfferValues;

    rows.push({
      trde_item: code,
      dq_id: null,
      item_name: eligible.item_name,
      brand: transacted.brand,
      brand_aliases: uniqueAliases([
        ...transacted.brand_aliases,
        transacted.brand,
      ]),
      item_category: eligible.item_category,
      missing_fields:
        getMissingFieldsFromCurrentValues(currentValues).join(","),
      status: "open",
      detected_at: null,
      current_dim_offers: currentValues,
      source: "transactions",
    });
  }

  // Tracked gaps with no recent transactions ("pg leftovers").
  for (const tracked of trackedByItem.values()) {
    if (transactedByItem.has(tracked.trde_item)) {
      continue;
    }

    const eligible = input.eligibleItems.get(tracked.trde_item);
    const dimOffer = input.dimOffers.get(tracked.trde_item);
    const stillMissing = isMissingOfferPricing(dimOffer);

    if (tracked.status === "open" && (!eligible || !stillMissing)) {
      resolveGapIds.push(tracked.dq_id);
      continue;
    }

    if (tracked.status === "open" || tracked.status === "submitted") {
      rows.push(
        buildTrackedRow(tracked, {
          item_name: eligible?.item_name ?? tracked.item_name,
          brand: tracked.brand,
          brand_aliases: [tracked.brand],
          item_category: eligible?.item_category ?? tracked.item_category,
          dimOffer,
          source: "tracked",
        }),
      );

      if (eligible) {
        collectContextUpdate(gapContextUpdates, tracked, {
          item_name: eligible.item_name,
          brand: tracked.brand,
          item_category: eligible.item_category,
        });
      }
    }
  }

  return { rows, resolveGapIds, gapContextUpdates };
}

function buildTrackedRow(
  tracked: TrackedGapRecord,
  context: {
    item_name: string;
    brand: string;
    brand_aliases: string[];
    item_category: string;
    dimOffer: CurrentDimOffersValues | undefined;
    source: GapQueueSnapshotSource;
  },
): GapQueueSnapshotRowInput {
  return {
    trde_item: tracked.trde_item,
    dq_id: tracked.dq_id,
    item_name: context.item_name,
    brand: context.brand,
    brand_aliases: uniqueAliases([
      ...context.brand_aliases,
      context.brand,
      tracked.brand,
    ]),
    item_category: context.item_category,
    missing_fields: tracked.missing_fields,
    status: tracked.status === "submitted" ? "submitted" : "open",
    detected_at: tracked.detected_at,
    current_dim_offers: context.dimOffer ?? emptyDimOfferValues,
    source: context.source,
  };
}

function collectContextUpdate(
  updates: TrackedGapContextUpdate[],
  tracked: TrackedGapRecord,
  context: { item_name: string; brand: string; item_category: string },
) {
  if (
    tracked.item_name === context.item_name &&
    tracked.brand === context.brand &&
    tracked.item_category === context.item_category
  ) {
    return;
  }

  updates.push({ dq_id: tracked.dq_id, ...context });
}

/** One `dq_gap_queue_refresh` row (a rebuild run), shared with the admin UI. */
export type SnapshotRefreshInfo = {
  id: number;
  trigger: string;
  status: "running" | "succeeded" | "failed";
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  detected_items: number | null;
  created_gaps: number | null;
  resolved_gaps: number | null;
  snapshot_rows: number | null;
  error: string | null;
};
