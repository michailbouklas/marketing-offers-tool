import type {
  InvoiceDetail,
  InvoiceFilters,
  InvoiceMetrics,
  InvoiceStoreSelection,
  StoreInvoiceMetrics,
} from "$lib/services/aggregator-invoices/aggregator-invoices";

const INVOICE_DETAIL_PATH = "/aggregator-offers/invoices/detail";
const STORE_METRICS_PATH = "/aggregator-offers/invoices/store-metrics";
const INVOICE_METRICS_PATH = "/aggregator-offers/invoices/metrics";

async function getJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`${path}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchInvoiceDetail(
  aggregator: InvoiceStoreSelection["aggregator"],
  documentid: string,
): Promise<InvoiceDetail> {
  return getJson(
    INVOICE_DETAIL_PATH,
    new URLSearchParams({ aggregator, documentid }),
  );
}

export function fetchStoreInvoiceMetrics(
  store: InvoiceStoreSelection,
  period: { from: string | null; to: string | null },
): Promise<StoreInvoiceMetrics> {
  const params = new URLSearchParams({ aggregator: store.aggregator });

  if (store.storeName) {
    params.set("storeName", store.storeName);
  }

  if (store.bpname) {
    params.set("bpname", store.bpname);
  }

  if (period.from) {
    params.set("from", period.from);
  }

  if (period.to) {
    params.set("to", period.to);
  }

  return getJson(STORE_METRICS_PATH, params);
}

/** Filter-wide metrics for the Info dialog; brand is sent as its id. */
export function fetchInvoiceMetrics(
  filters: InvoiceFilters,
  brandId: number | null,
): Promise<InvoiceMetrics> {
  const params = new URLSearchParams({ aggregator: filters.aggregator });

  if (filters.invoiceNumber) {
    params.set("invoiceNumber", filters.invoiceNumber);
  }

  if (filters.store) {
    params.set("store", filters.store);
  }

  if (filters.erpsent) {
    params.set("erpsent", filters.erpsent);
  }

  if (brandId) {
    params.set("brand", brandId.toString());
  }

  if (filters.lineDetails) {
    params.set("lineDetails", filters.lineDetails);
  }

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  return getJson(INVOICE_METRICS_PATH, params);
}
