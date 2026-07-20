import type {
  InvoiceDetail,
  InvoiceStoreSelection,
  StoreInvoiceMetrics,
} from "$lib/services/aggregator-invoices/aggregator-invoices";

const INVOICE_DETAIL_PATH = "/aggregator-offers/invoices/detail";
const STORE_METRICS_PATH = "/aggregator-offers/invoices/store-metrics";

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
