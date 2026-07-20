<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInvoiceAmount,
    invoiceAggregatorLabel,
    type InvoiceStoreSelection,
    type StoreInvoiceMetrics,
  } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import { fetchStoreInvoiceMetrics } from "$lib/services/aggregator-invoices/invoice-details";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
  import { SvelteMap } from "svelte/reactivity";

  type BreakdownTable = "transactionTypes" | "lineDetails";
  type BreakdownSortField = "label" | "lineItemCount" | "totalAmount";
  type SortDirection = "asc" | "desc";

  let {
    open = $bindable(false),
    store,
    from,
    to,
  }: {
    open?: boolean;
    store: InvoiceStoreSelection | null;
    from: string | null;
    to: string | null;
  } = $props();

  let metrics = $state<StoreInvoiceMetrics | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let requestSequence = 0;
  let transactionSortField = $state<BreakdownSortField>("totalAmount");
  let transactionSortDirection = $state<SortDirection>("desc");
  let lineDetailsSortField = $state<BreakdownSortField>("totalAmount");
  let lineDetailsSortDirection = $state<SortDirection>("desc");
  const metricsCache = new SvelteMap<string, StoreInvoiceMetrics>();

  const storeLabel = $derived(store?.storeName ?? store?.bpname ?? "Store");
  const periodLabel = $derived(
    from || to ? `${from ?? "Any date"} – ${to ?? "Today"}` : "All dates",
  );
  const sortedTransactionTypes = $derived.by(() =>
    sortBreakdown(
      metrics?.transactionTypes ?? [],
      transactionSortField,
      transactionSortDirection,
      (item) => item.transactionType,
    ),
  );
  const sortedLineDetails = $derived.by(() =>
    sortBreakdown(
      metrics?.lineDetails ?? [],
      lineDetailsSortField,
      lineDetailsSortDirection,
      (item) => item.lineDetails,
    ),
  );

  function sortBreakdown<
    T extends { lineItemCount: number; totalAmount: number },
  >(
    items: T[],
    field: BreakdownSortField,
    direction: SortDirection,
    getLabel: (item: T) => string | null,
  ): T[] {
    const multiplier = direction === "asc" ? 1 : -1;

    return [...items].sort((left, right) => {
      if (field === "label") {
        return (
          (getLabel(left) ?? "").localeCompare(getLabel(right) ?? "") *
          multiplier
        );
      }

      return (left[field] - right[field]) * multiplier;
    });
  }

  function getSort(table: BreakdownTable) {
    return table === "transactionTypes"
      ? {
          field: transactionSortField,
          direction: transactionSortDirection,
        }
      : {
          field: lineDetailsSortField,
          direction: lineDetailsSortDirection,
        };
  }

  function toggleSort(table: BreakdownTable, field: BreakdownSortField) {
    const current = getSort(table);
    const direction =
      current.field === field && current.direction === "desc" ? "asc" : "desc";

    if (table === "transactionTypes") {
      transactionSortField = field;
      transactionSortDirection = direction;
      return;
    }

    lineDetailsSortField = field;
    lineDetailsSortDirection = direction;
  }

  function ariaSort(table: BreakdownTable, field: BreakdownSortField) {
    const current = getSort(table);

    if (current.field !== field) {
      return "none" as const;
    }

    return current.direction === "asc"
      ? ("ascending" as const)
      : ("descending" as const);
  }

  function cacheKey(selection: InvoiceStoreSelection) {
    return JSON.stringify([selection, from, to]);
  }

  async function loadMetrics(selection: InvoiceStoreSelection) {
    const key = cacheKey(selection);
    const cached = metricsCache.get(key);
    const requestId = ++requestSequence;

    loadError = null;

    if (cached) {
      metrics = cached;
      loading = false;
      return;
    }

    metrics = null;
    loading = true;

    try {
      const result = await fetchStoreInvoiceMetrics(selection, { from, to });
      metricsCache.set(key, result);

      if (requestId === requestSequence) {
        metrics = result;
      }
    } catch {
      if (requestId === requestSequence) {
        loadError = "Failed to load store metrics. Close and try again.";
      }
    } finally {
      if (requestId === requestSequence) {
        loading = false;
      }
    }
  }

  $effect(() => {
    if (open && store) {
      void loadMetrics(store);
    }
  });
</script>

{#snippet sortButton(
  table: BreakdownTable,
  field: BreakdownSortField,
  label: string,
)}
  {@const current = getSort(table)}
  <Button
    variant="ghost"
    size="sm"
    class="-mx-2"
    onclick={() => toggleSort(table, field)}
  >
    {label}
    {#if current.field !== field}
      <ArrowUpDownIcon data-icon="inline-end" />
    {:else if current.direction === "asc"}
      <ArrowUpIcon data-icon="inline-end" />
    {:else}
      <ArrowDownIcon data-icon="inline-end" />
    {/if}
  </Button>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title class="flex flex-wrap items-center gap-2">
        {storeLabel}
        {#if store}
          <Badge variant="outline">
            {invoiceAggregatorLabel(store.aggregator)}
          </Badge>
        {/if}
      </Dialog.Title>
      <Dialog.Description>
        Invoice performance for {periodLabel}.
      </Dialog.Description>
    </Dialog.Header>

    {#if loadError}
      <p class="text-destructive py-8 text-center text-sm">{loadError}</p>
    {:else if loading}
      <div class="grid gap-3 sm:grid-cols-3">
        {#each Array.from({ length: 3 }, (_, index) => index) as index (index)}
          <Skeleton class="h-24 w-full rounded-xl" />
        {/each}
      </div>
      <Skeleton class="h-48 w-full rounded-xl" />
    {:else if metrics}
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="border-border/70 bg-muted/30 rounded-xl border p-4">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">
            Invoices
          </p>
          <p class="mt-3 text-3xl font-semibold tabular-nums">
            {metrics.invoiceCount}
          </p>
        </div>
        <div class="border-border/70 bg-muted/30 rounded-xl border p-4">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">
            Line items
          </p>
          <p class="mt-3 text-3xl font-semibold tabular-nums">
            {metrics.lineItemCount}
          </p>
        </div>
        <div class="border-border/70 bg-primary/5 rounded-xl border p-4">
          <p class="text-muted-foreground text-xs tracking-wide uppercase">
            Invoice total
          </p>
          <p class="mt-3 text-2xl font-semibold tabular-nums">
            {formatInvoiceAmount(metrics.totalInvoiceAmount)}
          </p>
        </div>
      </div>

      <div class="space-y-2">
        <div>
          <h3 class="font-medium">Transaction types</h3>
          <p class="text-muted-foreground text-sm">
            Line count and summed total amount by transaction type.
          </p>
        </div>

        <div class="overflow-x-auto rounded-xl border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head aria-sort={ariaSort("transactionTypes", "label")}>
                  {@render sortButton(
                    "transactionTypes",
                    "label",
                    "Transaction type",
                  )}
                </Table.Head>
                <Table.Head
                  class="text-right"
                  aria-sort={ariaSort("transactionTypes", "lineItemCount")}
                >
                  <div class="flex justify-end">
                    {@render sortButton(
                      "transactionTypes",
                      "lineItemCount",
                      "Line items",
                    )}
                  </div>
                </Table.Head>
                <Table.Head
                  class="text-right"
                  aria-sort={ariaSort("transactionTypes", "totalAmount")}
                >
                  <div class="flex justify-end">
                    {@render sortButton(
                      "transactionTypes",
                      "totalAmount",
                      "Total amount",
                    )}
                  </div>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if metrics.transactionTypes.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={3}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No line items were found for this period.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each sortedTransactionTypes as item (item.transactionType)}
                  <Table.Row>
                    <Table.Cell>
                      {item.transactionType ?? "Unspecified"}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {item.lineItemCount}
                    </Table.Cell>
                    <Table.Cell class="text-right font-medium tabular-nums">
                      {formatInvoiceAmount(item.totalAmount)}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        </div>
      </div>

      <div class="space-y-2">
        <div>
          <h3 class="font-medium">Line details</h3>
          <p class="text-muted-foreground text-sm">
            Line count and summed total amount by line description.
          </p>
        </div>

        <div class="overflow-x-auto rounded-xl border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head aria-sort={ariaSort("lineDetails", "label")}>
                  {@render sortButton("lineDetails", "label", "Line details")}
                </Table.Head>
                <Table.Head
                  class="text-right"
                  aria-sort={ariaSort("lineDetails", "lineItemCount")}
                >
                  <div class="flex justify-end">
                    {@render sortButton(
                      "lineDetails",
                      "lineItemCount",
                      "Line items",
                    )}
                  </div>
                </Table.Head>
                <Table.Head
                  class="text-right"
                  aria-sort={ariaSort("lineDetails", "totalAmount")}
                >
                  <div class="flex justify-end">
                    {@render sortButton(
                      "lineDetails",
                      "totalAmount",
                      "Total amount",
                    )}
                  </div>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if metrics.lineDetails.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={3}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No line details were found for this period.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each sortedLineDetails as item (item.lineDetails)}
                  <Table.Row>
                    <Table.Cell class="max-w-md whitespace-normal">
                      {item.lineDetails ?? "Unspecified"}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {item.lineItemCount}
                    </Table.Cell>
                    <Table.Cell class="text-right font-medium tabular-nums">
                      {formatInvoiceAmount(item.totalAmount)}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
