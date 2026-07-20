import { requireApiPermission } from "$lib/server/auth-guards";
import {
  invoiceAggregators,
  invoiceErpSentValues,
} from "$lib/services/aggregator-invoices/aggregator-invoices";
import { getInvoiceMetrics } from "$lib/services/aggregator-invoices/invoices.server";
import { resolveBrandProjectCodes } from "$lib/services/brand-project-codes.server";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);
const optionalDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
);

// Mirrors the page's filter params so the dialog reflects exactly what the
// table/chart shows.
const querySchema = z.object({
  aggregator: z.enum(invoiceAggregators),
  invoiceNumber: optionalText,
  store: optionalText,
  erpsent: z.preprocess(
    emptyToUndefined,
    z.enum(invoiceErpSentValues).optional(),
  ),
  brand: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  lineDetails: optionalText,
  from: optionalDate,
  to: optionalDate,
});

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { aggregatorInvoices: ["view"] });

  const params = event.url.searchParams;
  const parsed = querySchema.safeParse({
    aggregator: params.get("aggregator") ?? undefined,
    invoiceNumber: params.get("invoiceNumber") ?? undefined,
    store: params.get("store") ?? undefined,
    erpsent: params.get("erpsent") ?? undefined,
    brand: params.get("brand") ?? undefined,
    lineDetails: params.get("lineDetails") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  if (!parsed.success) {
    error(400, "Invalid query");
  }

  const projectCodes =
    parsed.data.brand !== undefined
      ? await resolveBrandProjectCodes(parsed.data.brand)
      : null;

  return json(
    await getInvoiceMetrics({
      aggregator: parsed.data.aggregator,
      invoiceNumber: parsed.data.invoiceNumber ?? null,
      store: parsed.data.store ?? null,
      erpsent: parsed.data.erpsent ?? null,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      lineDetails: parsed.data.lineDetails ?? null,
      projectCodes,
    }),
  );
};
