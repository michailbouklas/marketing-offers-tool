import { z } from "zod";
import { requireAdminUser } from "$lib/server/auth-guards";
import {
  adminDimOffersSortDirections,
  adminDimOffersSortFields,
} from "$lib/services/admin-dim-offers";
import { listBrands } from "$lib/services/brands.server";
import { listAdminDimOffersRows } from "$lib/services/admin-dim-offers.server";
import type { RequestHandler } from "./$types";

const searchParamsSchema = z.object({
  query: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().trim().min(1).optional()),
  brandAlias: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().trim().min(1).optional()),
  sortBy: z.enum(adminDimOffersSortFields).default("item_code"),
  sortDir: z.enum(adminDimOffersSortDirections).default("asc"),
});

function escapeCsvValue(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function formatNumber(value: number | null) {
  return value === null ? null : value;
}

export const GET: RequestHandler = async (event) => {
  await requireAdminUser(event);

  const brands = await listBrands({ active: true });
  const allowedBrandAliases = new Set(
    brands
      .map((brand) => brand.alias.trim())
      .filter((alias) => alias.length > 0),
  );
  const parseResult = searchParamsSchema.safeParse({
    query: event.url.searchParams.get("query") ?? undefined,
    brandAlias: event.url.searchParams.get("brandAlias") ?? undefined,
    sortBy: event.url.searchParams.get("sortBy") ?? undefined,
    sortDir: event.url.searchParams.get("sortDir") ?? undefined,
  });

  const query = parseResult.success ? (parseResult.data.query ?? null) : null;
  const sortBy = parseResult.success ? parseResult.data.sortBy : "item_code";
  const sortDir = parseResult.success ? parseResult.data.sortDir : "asc";
  const brandAlias =
    parseResult.success &&
    parseResult.data.brandAlias &&
    allowedBrandAliases.has(parseResult.data.brandAlias)
      ? parseResult.data.brandAlias
      : null;

  const rows = await listAdminDimOffersRows({
    query,
    brandAlias,
    sortBy,
    sortDir,
  });

  const csvLines = [
    [
      "item_code",
      "product_desc",
      "brand_alias",
      "channel",
      "category",
      "subcategory",
      "ideal_price",
      "selling_price",
      "fc_perc",
      "mktg_spend",
      "discount_amount",
    ].join(","),
    ...rows.map((row) =>
      [
        row.item_code,
        row.product_desc,
        row.brand_alias,
        row.channel,
        row.category,
        row.subcategory,
        formatNumber(row.ideal_price),
        formatNumber(row.selling_price),
        formatNumber(row.fc_perc),
        formatNumber(row.mktg_spend),
        formatNumber(row.discount_amount),
      ]
        .map(escapeCsvValue)
        .join(","),
    ),
  ];

  return new Response(csvLines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="dim-offers-export.csv"',
    },
  });
};
