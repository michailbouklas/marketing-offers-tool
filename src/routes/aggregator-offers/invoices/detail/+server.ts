import { requireApiPermission } from "$lib/server/auth-guards";
import { invoiceAggregators } from "$lib/services/aggregator-invoices/aggregator-invoices";
import { getInvoiceDetail } from "$lib/services/aggregator-invoices/invoices.server";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";

// `documentid` is a free-form varchar, so it travels as a query param rather
// than a path segment.
const querySchema = z.object({
  aggregator: z.enum(invoiceAggregators),
  documentid: z.string().trim().min(1),
});

export const GET: RequestHandler = async (event) => {
  await requireApiPermission(event, { aggregatorInvoices: ["view"] });

  const parsed = querySchema.safeParse({
    aggregator: event.url.searchParams.get("aggregator") ?? undefined,
    documentid: event.url.searchParams.get("documentid") ?? undefined,
  });

  if (!parsed.success) {
    error(400, "Invalid query");
  }

  const detail = await getInvoiceDetail(
    parsed.data.aggregator,
    parsed.data.documentid,
  );

  if (!detail) {
    error(404, "Invoice not found");
  }

  return json(detail);
};
