import { prisma } from "$lib/server/prisma";
import {
  type DimOffersStagingStatus,
  type DqGapStatus,
} from "../../generated/prisma/enums";
import type { LookupOption } from "$lib/services/offers-data-quality";

export type GapRecord = {
  dq_id: number;
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  missing_fields: string;
  detected_at: Date;
  status: DqGapStatus;
  resolved_at: Date | null;
};

export type ListGapRecordsFilters = {
  statuses?: DqGapStatus[];
};

export type CreateDimOffersStagingInput = {
  dq_id: number;
  item_code: string;
  channel: string;
  category: string;
  subcategory: string;
  ideal_price: string;
  selling_price: string;
  fc_perc: string;
  mktg_spend?: string | null;
  notes?: string | null;
  submitted_by: string;
};

export async function listChannels(): Promise<LookupOption[]> {
  return prisma.channels.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function listPricingCategories(): Promise<LookupOption[]> {
  return prisma.categories.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function listPricingSubcategoriesByCategoryId(
  categoryId: number,
): Promise<LookupOption[]> {
  return prisma.subcategories.findMany({
    where: {
      category_id: categoryId,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export async function getGapRecordById(id: number): Promise<GapRecord | null> {
  return prisma.dq_missing_offers_pricing.findUnique({
    where: {
      dq_id: id,
    },
  });
}

export async function getGapRecordByItemCode(
  itemCode: string,
): Promise<GapRecord | null> {
  return prisma.dq_missing_offers_pricing.findFirst({
    where: {
      trde_item: itemCode,
    },
    orderBy: [{ detected_at: "desc" }, { dq_id: "desc" }],
  });
}

export async function listGapRecords(
  filters: ListGapRecordsFilters = {},
): Promise<GapRecord[]> {
  return prisma.dq_missing_offers_pricing.findMany({
    where: {
      ...(filters.statuses?.length
        ? {
            status: {
              in: filters.statuses,
            },
          }
        : {}),
    },
    orderBy: [{ detected_at: "desc" }, { dq_id: "desc" }],
  });
}

export async function getPendingStagingRecordByGapId(dqId: number) {
  return prisma.dim_offers_staging.findFirst({
    where: {
      dq_id: dqId,
      status: "pending",
    },
    orderBy: [{ submitted_at: "desc" }, { id: "desc" }],
  });
}

export async function getStagingRecordById(id: number) {
  return prisma.dim_offers_staging.findUnique({
    where: {
      id,
    },
  });
}

export async function getPendingStagingRecordByItemCode(itemCode: string) {
  return prisma.dim_offers_staging.findFirst({
    where: {
      item_code: itemCode,
      status: "pending",
    },
    orderBy: [{ submitted_at: "desc" }, { id: "desc" }],
  });
}

export async function listPendingStagingRecords() {
  return prisma.dim_offers_staging.findMany({
    where: {
      status: "pending",
    },
    orderBy: [{ submitted_at: "desc" }, { id: "desc" }],
  });
}

export async function countPendingStagingRecords() {
  return prisma.dim_offers_staging.count({
    where: {
      status: "pending",
    },
  });
}

export async function validateCategorySubcategoryPair(
  category: string,
  subcategory: string,
) {
  const match = await prisma.subcategories.findFirst({
    where: {
      name: subcategory,
      category: {
        name: category,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(match);
}

export async function createDimOffersStagingRecord(
  data: CreateDimOffersStagingInput,
) {
  return prisma.dim_offers_staging.create({
    data,
  });
}

export async function createGapRecord(data: {
  trde_item: string;
  item_name: string;
  brand: string;
  item_category: string;
  missing_fields: string;
}) {
  return prisma.dq_missing_offers_pricing.create({
    data,
  });
}

export async function updateDimOffersStagingStatus(
  id: number,
  status: DimOffersStagingStatus,
  approvedBy?: string | null,
) {
  return prisma.dim_offers_staging.update({
    where: {
      id,
    },
    data: {
      status,
      approved_by: approvedBy ?? null,
      approved_at: status === "approved" ? new Date() : null,
    },
  });
}

export async function updateGapRecordStatus(id: number, status: DqGapStatus) {
  return prisma.dq_missing_offers_pricing.update({
    where: {
      dq_id: id,
    },
    data: {
      status,
      resolved_at: status === "resolved" ? new Date() : null,
    },
  });
}
