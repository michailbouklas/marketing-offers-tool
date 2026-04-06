import { prisma } from "$lib/server/prisma";
import type {
  AdminDimOfferAuditEntry,
  AdminDimOfferRow,
} from "$lib/services/admin-dim-offers";
import type { DimOfferAuditSnapshot } from "$lib/services/offers-data-quality-clickhouse.server";
import { Prisma } from "../../generated/prisma/client";
import type {
  DimOffersAuditAction,
  DimOffersAuditSource,
} from "../../generated/prisma/enums";

type CreateDimOffersAuditRecordInput = {
  itemCode: string;
  action: DimOffersAuditAction;
  changedBy: string;
  source?: DimOffersAuditSource;
  stagingId?: number | null;
  dqId?: number | null;
  beforeValues?: DimOfferAuditSnapshot | null;
  afterValues: DimOfferAuditSnapshot;
};

function listChangedFields(
  beforeValues: DimOfferAuditSnapshot | null | undefined,
  afterValues: DimOfferAuditSnapshot,
) {
  const keys = Object.keys(afterValues) as (keyof DimOfferAuditSnapshot)[];

  return keys.filter((key) => beforeValues?.[key] !== afterValues[key]);
}

export async function createDimOffersAuditRecord({
  itemCode,
  action,
  changedBy,
  source = "gap_approval",
  stagingId,
  dqId,
  beforeValues,
  afterValues,
}: CreateDimOffersAuditRecordInput) {
  return prisma.dim_offers_audit.create({
    data: {
      item_code: itemCode,
      action,
      changed_by: changedBy,
      source,
      staging_id: stagingId ?? null,
      dq_id: dqId ?? null,
      before_values: beforeValues ?? Prisma.DbNull,
      after_values: afterValues,
      changed_fields: listChangedFields(beforeValues, afterValues),
    },
  });
}

function parseNullableNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

function isSnapshotRecord(value: Prisma.JsonValue | null) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapSnapshotToAdminRow(
  snapshot: Prisma.JsonValue | null,
): AdminDimOfferRow | null {
  if (!isSnapshotRecord(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;

  return {
    item_code: typeof record.item_code === "string" ? record.item_code : "",
    product_desc:
      typeof record.product_desc === "string" ? record.product_desc : null,
    brand_alias:
      typeof record.brand_alias === "string" ? record.brand_alias : null,
    channel: typeof record.channel === "string" ? record.channel : null,
    category: typeof record.category === "string" ? record.category : null,
    subcategory:
      typeof record.subcategory === "string" ? record.subcategory : null,
    ideal_price: parseNullableNumber(record.ideal_price),
    selling_price: parseNullableNumber(record.selling_price),
    fc_perc: parseNullableNumber(record.fc_perc),
    mktg_spend: parseNullableNumber(record.mktg_spend),
    discount_amount: parseNullableNumber(record.discount_amount),
    last_changed_at: null,
    last_changed_by: null,
    last_changed_by_name: null,
    last_changed_by_email: null,
  };
}

export async function listDimOfferAuditEntries(
  itemCode: string,
): Promise<AdminDimOfferAuditEntry[]> {
  const records = await prisma.dim_offers_audit.findMany({
    where: {
      item_code: itemCode,
    },
    orderBy: [{ changed_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      item_code: true,
      action: true,
      source: true,
      changed_by: true,
      changed_at: true,
      staging_id: true,
      dq_id: true,
      changed_fields: true,
      before_values: true,
      after_values: true,
    },
  });

  const actorIds = [
    ...new Set(
      records.map((record) => record.changed_by.trim()).filter(Boolean),
    ),
  ];
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

  return records.map((record) => {
    const actor = actorsById.get(record.changed_by);

    return {
      id: record.id,
      item_code: record.item_code,
      action: record.action,
      source: record.source,
      changed_by: record.changed_by,
      changed_by_name: actor?.name ?? null,
      changed_by_email: actor?.email ?? null,
      changed_at: record.changed_at.toISOString(),
      staging_id: record.staging_id,
      dq_id: record.dq_id,
      changed_fields: record.changed_fields,
      before_values: mapSnapshotToAdminRow(record.before_values),
      after_values: mapSnapshotToAdminRow(record.after_values) ?? {
        item_code: record.item_code,
        product_desc: null,
        brand_alias: null,
        channel: null,
        category: null,
        subcategory: null,
        ideal_price: null,
        selling_price: null,
        fc_perc: null,
        mktg_spend: null,
        discount_amount: null,
        last_changed_at: null,
        last_changed_by: null,
        last_changed_by_name: null,
        last_changed_by_email: null,
      },
    };
  });
}
