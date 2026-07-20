import { requirePermission } from "$lib/server/auth-guards";
import {
  invoiceAggregators,
  invoiceErpSentValues,
  invoiceSortDirections,
  invoiceSortFields,
} from "$lib/services/aggregator-invoices/aggregator-invoices";
import { listInvoiceHeaders } from "$lib/services/aggregator-invoices/invoices.server";
import { resolveBrandProjectCodes } from "$lib/services/brand-project-codes.server";
import { listBrands } from "$lib/services/brands.server";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PAGE_SIZE = 50;

// GET form submits include untouched fields as empty strings, so every optional
// field must treat "" as "not set" and fail per-field (`catch`).
function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const paramsSchema = z.object({
  aggregator: z.enum(invoiceAggregators).default("wolt").catch("wolt"),
  page: z.coerce.number().int().positive().default(1).catch(1),
  invoiceNumber: z
    .preprocess(emptyToUndefined, z.string().trim().min(1).optional())
    .catch(undefined),
  store: z
    .preprocess(emptyToUndefined, z.string().trim().min(1).optional())
    .catch(undefined),
  erpsent: z
    .preprocess(emptyToUndefined, z.enum(invoiceErpSentValues).optional())
    .catch(undefined),
  brand: z
    .preprocess(emptyToUndefined, z.coerce.number().int().positive().optional())
    .catch(undefined),
  lineDetails: z
    .preprocess(emptyToUndefined, z.string().trim().min(1).optional())
    .catch(undefined),
  from: z
    .preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    )
    .catch(undefined),
  to: z
    .preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    )
    .catch(undefined),
  sortBy: z
    .enum(invoiceSortFields)
    .default("documentdate")
    .catch("documentdate"),
  sortDir: z.enum(invoiceSortDirections).default("desc").catch("desc"),
});

export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { aggregatorInvoices: ["view"] });

  const params = event.url.searchParams;

  const parsed = paramsSchema.safeParse({
    aggregator: params.get("aggregator") ?? undefined,
    page: params.get("page") ?? 1,
    invoiceNumber: params.get("invoiceNumber") ?? undefined,
    store: params.get("store") ?? undefined,
    erpsent: params.get("erpsent") ?? undefined,
    brand: params.get("brand") ?? undefined,
    lineDetails: params.get("lineDetails") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    sortBy: params.get("sortBy") ?? undefined,
    sortDir: params.get("sortDir") ?? undefined,
  });

  const filters = parsed.success
    ? {
        aggregator: parsed.data.aggregator,
        invoiceNumber: parsed.data.invoiceNumber ?? null,
        store: parsed.data.store ?? null,
        erpsent: parsed.data.erpsent ?? null,
        from: parsed.data.from ?? null,
        to: parsed.data.to ?? null,
        lineDetails: parsed.data.lineDetails ?? null,
      }
    : {
        aggregator: "wolt" as const,
        invoiceNumber: null,
        store: null,
        erpsent: null,
        from: null,
        to: null,
        lineDetails: null,
      };
  const page = parsed.success ? parsed.data.page : 1;
  const sortBy = parsed.success ? parsed.data.sortBy : "documentdate";
  const sortDir = parsed.success ? parsed.data.sortDir : "desc";

  const brands = await listBrands({ active: true });

  // Ignore brand ids that are unknown or inactive (stale/hand-edited URLs).
  const requestedBrandId = parsed.success ? (parsed.data.brand ?? null) : null;
  const brandId =
    requestedBrandId !== null &&
    brands.some((brand) => brand.id === requestedBrandId)
      ? requestedBrandId
      : null;

  // `[]` (brand without stores/SAP alias) intentionally matches zero invoices;
  // `null` disables the filter.
  const projectCodes =
    brandId !== null ? await resolveBrandProjectCodes(brandId) : null;

  const invoicesPage = await listInvoiceHeaders({
    ...filters,
    projectCodes,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
  });

  return { filters, brandId, brands, sortBy, sortDir, invoicesPage };
};
