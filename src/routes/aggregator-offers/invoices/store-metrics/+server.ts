import { requireApiPermission } from "$lib/server/auth-guards";
import { invoiceAggregators } from "$lib/services/aggregator-invoices/aggregator-invoices";
import { getStoreInvoiceMetrics } from "$lib/services/aggregator-invoices/invoices.server";
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

const querySchema = z
  .object({
    aggregator: z.enum(invoiceAggregators),
    storeName: optionalText,
    bpname: optionalText,
    from: optionalDate,
    to: optionalDate,
  })
  .refine((value) => value.storeName || value.bpname, {
    message: "A store identity is required",
  });

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { aggregatorInvoices: ["view"] });

  const parsed = querySchema.safeParse({
    aggregator: event.url.searchParams.get("aggregator") ?? undefined,
    storeName: event.url.searchParams.get("storeName") ?? undefined,
    bpname: event.url.searchParams.get("bpname") ?? undefined,
    from: event.url.searchParams.get("from") ?? undefined,
    to: event.url.searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) {
    error(400, "Invalid query");
  }

  return json(
    await getStoreInvoiceMetrics({
      aggregator: parsed.data.aggregator,
      storeName: parsed.data.storeName ?? null,
      bpname: parsed.data.bpname ?? null,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
    }),
  );
};
