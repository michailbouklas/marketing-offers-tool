<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInvoiceAmount,
    formatInvoiceDate,
    formatInvoiceDateTime,
    invoiceAggregatorLabel,
    type InvoiceDetail,
    type InvoiceHeaderRow,
    type InvoiceLineRow,
    type InvoiceStoreSelection,
    type InvoiceSortDirection,
    type InvoiceSortField,
  } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import { fetchInvoiceDetail } from "$lib/services/aggregator-invoices/invoice-details";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import { SvelteMap } from "svelte/reactivity";
  import StoreMetricsDialog from "./store-metrics-dialog.svelte";

  let {
    items,
    sortBy,
    sortDir,
    getSortHref,
    from,
    to,
  }: {
    items: InvoiceHeaderRow[];
    sortBy: InvoiceSortField;
    sortDir: InvoiceSortDirection;
    getSortHref: (column: InvoiceSortField) => string;
    from: string | null;
    to: string | null;
  } = $props();

  let dialogOpen = $state(false);
  let selected = $state<InvoiceHeaderRow | null>(null);
  let lines = $state<InvoiceLineRow[] | null>(null);
  let loadingLines = $state(false);
  let linesError = $state<string | null>(null);
  let storeDialogOpen = $state(false);
  let selectedStore = $state<InvoiceStoreSelection | null>(null);

  // Fetched lines per invoice so reopening a row is instant. Keyed per
  // aggregator because document ids are only unique within one.
  const linesCache = new SvelteMap<string, InvoiceLineRow[]>();

  function cacheKey(row: InvoiceHeaderRow) {
    return `${row.aggregator}:${row.documentid}`;
  }

  async function openInvoice(row: InvoiceHeaderRow) {
    selected = row;
    dialogOpen = true;
    linesError = null;

    const cached = linesCache.get(cacheKey(row));

    if (cached) {
      lines = cached;
      return;
    }

    lines = null;
    loadingLines = true;

    try {
      const detail: InvoiceDetail = await fetchInvoiceDetail(
        row.aggregator,
        row.documentid,
      );
      linesCache.set(cacheKey(row), detail.lines);

      // A slow response must not clobber a dialog the user has since pointed
      // at a different invoice.
      if (selected && cacheKey(selected) === cacheKey(row)) {
        lines = detail.lines;
      }
    } catch {
      if (selected && cacheKey(selected) === cacheKey(row)) {
        linesError = "Failed to load invoice lines. Close and try again.";
      }
    } finally {
      if (selected && cacheKey(selected) === cacheKey(row)) {
        loadingLines = false;
      }
    }
  }

  function openStoreMetrics(row: InvoiceHeaderRow) {
    if (!row.storeName && !row.bpname) {
      return;
    }

    selectedStore = {
      aggregator: row.aggregator,
      storeName: row.storeName,
      bpname: row.bpname,
    };
    storeDialogOpen = true;
  }

  const showJeColumn = $derived(
    lines !== null && lines.some((line) => line.jeNumber !== null),
  );
</script>

{#snippet sortableHead(column: InvoiceSortField, label: string)}
  <a
    href={getSortHref(column)}
    class="hover:text-foreground inline-flex items-center gap-1"
  >
    {label}
    {#if sortBy === column}
      {#if sortDir === "asc"}
        <ArrowUpIcon class="size-3.5" />
      {:else}
        <ArrowDownIcon class="size-3.5" />
      {/if}
    {/if}
  </a>
{/snippet}

<div class="overflow-x-auto">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>
          {@render sortableHead("documentdate", "Document date")}
        </Table.Head>
        <Table.Head>Invoice #</Table.Head>
        <Table.Head>Document ID</Table.Head>
        <Table.Head>Store</Table.Head>
        <Table.Head>Timeframe</Table.Head>
        <Table.Head class="text-right">
          {@render sortableHead("totalpayout", "Total payout")}
        </Table.Head>
        <Table.Head>ERP sent</Table.Head>
        <Table.Head class="text-right">Lines</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if items.length === 0}
        <Table.Row>
          <Table.Cell
            colspan={8}
            class="text-muted-foreground py-8 text-center"
          >
            No invoices match the current filters.
          </Table.Cell>
        </Table.Row>
      {:else}
        {#each items as row (`${row.aggregator}:${row.documentid}`)}
          <Table.Row class="hover:bg-muted/50">
            <Table.Cell class="text-muted-foreground whitespace-nowrap">
              {formatInvoiceDate(row.documentdate)}
            </Table.Cell>
            <Table.Cell>
              <Button
                variant="link"
                class="h-auto px-0 py-0 font-medium"
                onclick={() => openInvoice(row)}
              >
                {row.invoicenumber ?? "View invoice"}
              </Button>
            </Table.Cell>
            <Table.Cell class="max-w-48 truncate font-mono text-xs">
              {row.documentid}
            </Table.Cell>
            <Table.Cell class="max-w-56 truncate">
              {#if row.storeName || row.bpname}
                <Button
                  variant="link"
                  class="h-auto max-w-full justify-start truncate px-0 py-0 font-normal"
                  onclick={() => openStoreMetrics(row)}
                >
                  {row.storeName ?? row.bpname}
                </Button>
              {:else}
                —
              {/if}
            </Table.Cell>
            <Table.Cell class="text-muted-foreground whitespace-nowrap">
              {row.timeframe ?? "—"}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatInvoiceAmount(row.totalpayout)}
            </Table.Cell>
            <Table.Cell>
              <Badge variant={row.erpsent === "Y" ? "default" : "outline"}>
                {row.erpsent === "Y" ? "Sent" : "Not sent"}
              </Badge>
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {row.lineCount}
            </Table.Cell>
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</div>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
    {#if selected}
      <Dialog.Header>
        <Dialog.Title class="flex flex-wrap items-center gap-2">
          Invoice {selected.invoicenumber ?? selected.documentid}
          <Badge variant="outline">
            {invoiceAggregatorLabel(selected.aggregator)}
          </Badge>
        </Dialog.Title>
        <Dialog.Description>
          {formatInvoiceDate(selected.documentdate)}
          {#if selected.timeframe}
            · {selected.timeframe}
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <dl class="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Document ID</dt>
        <dd class="font-mono text-xs break-all">{selected.documentid}</dd>

        <dt class="text-muted-foreground">Invoice #</dt>
        <dd>{selected.invoicenumber ?? "—"}</dd>

        <dt class="text-muted-foreground">Document date</dt>
        <dd>{formatInvoiceDate(selected.documentdate)}</dd>

        <dt class="text-muted-foreground">Timeframe</dt>
        <dd>{selected.timeframe ?? "—"}</dd>

        <dt class="text-muted-foreground">Store</dt>
        <dd>{selected.storeName ?? "—"}</dd>

        <dt class="text-muted-foreground">BP code</dt>
        <dd class="font-mono text-xs">{selected.bpcode ?? "—"}</dd>

        <dt class="text-muted-foreground">BP name</dt>
        <dd>{selected.bpname ?? "—"}</dd>

        <dt class="text-muted-foreground">Distribution rule</dt>
        <dd>{selected.distributionrule ?? "—"}</dd>

        <dt class="text-muted-foreground">Project</dt>
        <dd>{selected.project ?? "—"}</dd>

        <dt class="text-muted-foreground">ERP database</dt>
        <dd>{selected.erpdatabase ?? "—"}</dd>

        <dt class="text-muted-foreground">Total payout</dt>
        <dd class="tabular-nums">
          {formatInvoiceAmount(selected.totalpayout)}
        </dd>

        <dt class="text-muted-foreground">ERP sent</dt>
        <dd>
          <Badge variant={selected.erpsent === "Y" ? "default" : "outline"}>
            {selected.erpsent === "Y" ? "Sent" : "Not sent"}
          </Badge>
        </dd>

        <dt class="text-muted-foreground">ERP created</dt>
        <dd>{formatInvoiceDateTime(selected.erpcreatedat)}</dd>

        <dt class="text-muted-foreground">Imported</dt>
        <dd>{formatInvoiceDateTime(selected.createdat)}</dd>

        {#each selected.extraFields as field (field.label)}
          <dt class="text-muted-foreground">{field.label}</dt>
          <dd class="whitespace-pre-wrap">{field.value}</dd>
        {/each}
      </dl>

      <div class="space-y-2">
        <p class="text-sm font-medium">
          Lines
          {#if lines}
            <span class="text-muted-foreground">({lines.length})</span>
          {/if}
        </p>

        {#if linesError}
          <p class="text-destructive text-sm">{linesError}</p>
        {:else if loadingLines}
          <div class="space-y-2">
            {#each Array.from({ length: 4 }, (_, index) => index) as index (index)}
              <Skeleton class="h-8 w-full" />
            {/each}
          </div>
        {:else if lines}
          <div class="overflow-x-auto">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head class="text-right">#</Table.Head>
                  {#if showJeColumn}
                    <Table.Head class="text-right">JE #</Table.Head>
                  {/if}
                  <Table.Head>Type</Table.Head>
                  <Table.Head>Details</Table.Head>
                  <Table.Head class="text-right">Amount</Table.Head>
                  <Table.Head class="text-right">VAT</Table.Head>
                  <Table.Head class="text-right">Total</Table.Head>
                  <Table.Head>Account</Table.Head>
                  <Table.Head>VAT code</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#if lines.length === 0}
                  <Table.Row>
                    <Table.Cell
                      colspan={showJeColumn ? 9 : 8}
                      class="text-muted-foreground py-6 text-center"
                    >
                      This invoice has no lines.
                    </Table.Cell>
                  </Table.Row>
                {:else}
                  {#each lines as line (`${line.jeNumber ?? 0}:${line.linenumber}`)}
                    <Table.Row>
                      <Table.Cell class="text-right tabular-nums">
                        {line.linenumber}
                      </Table.Cell>
                      {#if showJeColumn}
                        <Table.Cell class="text-right tabular-nums">
                          {line.jeNumber ?? "—"}
                        </Table.Cell>
                      {/if}
                      <Table.Cell class="whitespace-nowrap">
                        {line.transtype ?? "—"}
                      </Table.Cell>
                      <Table.Cell class="max-w-md">
                        <span class="text-sm whitespace-normal">
                          {line.linedetails ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {formatInvoiceAmount(line.amount)}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {formatInvoiceAmount(line.vatamount)}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {formatInvoiceAmount(line.totalamount)}
                      </Table.Cell>
                      <Table.Cell class="font-mono text-xs">
                        {line.accountcode ?? "—"}
                      </Table.Cell>
                      <Table.Cell class="font-mono text-xs">
                        {line.vatcode ?? "—"}
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                {/if}
              </Table.Body>
            </Table.Root>
          </div>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<StoreMetricsDialog
  bind:open={storeDialogOpen}
  store={selectedStore}
  {from}
  {to}
/>
