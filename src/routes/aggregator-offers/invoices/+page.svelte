<script lang="ts">
  import { goto } from "$app/navigation";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import InvoiceMetricsDialog from "$lib/components/aggregator-invoices/invoice-metrics-dialog.svelte";
  import InvoicesTable from "$lib/components/aggregator-invoices/invoices-table.svelte";
  import InvoicesTrendChart from "$lib/components/aggregator-invoices/invoices-trend-chart.svelte";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    formatInvoiceAmount,
    invoiceAggregatorLabel,
    invoiceAggregators,
    type InvoiceAggregator,
    type InvoiceErpSent,
    type InvoiceSortDirection,
    type InvoiceSortField,
    type InvoiceViewMode,
  } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import { formatBrandLabel } from "$lib/services/brands";
  import ChartLineIcon from "@lucide/svelte/icons/chart-line";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import InfoIcon from "@lucide/svelte/icons/info";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TableIcon from "@lucide/svelte/icons/table";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let infoOpen = $state(false);

  const rows = $derived(data.invoicesPage.items);
  const selectedBrand = $derived(
    data.brandId !== null
      ? (data.brands.find((brand) => brand.id === data.brandId) ?? null)
      : null,
  );
  const page = $derived(data.invoicesPage.page);
  const pageSize = $derived(data.invoicesPage.pageSize);
  const totalItems = $derived(data.invoicesPage.totalItems);
  const totalPages = $derived(data.invoicesPage.totalPages);

  function submitSearchForm() {
    searchForm?.requestSubmit();
  }

  function handleSearchInput() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }

    searchDebounceTimeout = setTimeout(() => {
      searchDebounceTimeout = null;
      submitSearchForm();
    }, 400);
  }

  function handleSearchChange() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    submitSearchForm();
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") {
      return;
    }

    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    event.preventDefault();
    submitSearchForm();
  }

  function getRouteHref({
    page = data.invoicesPage.page,
    aggregator = data.filters.aggregator,
    invoiceNumber = data.filters.invoiceNumber,
    store = data.filters.store,
    erpsent = data.filters.erpsent,
    brandId = data.brandId,
    lineDetails = data.filters.lineDetails,
    from = data.filters.from,
    to = data.filters.to,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
    view = data.view,
  }: {
    page?: number;
    aggregator?: InvoiceAggregator;
    invoiceNumber?: string | null;
    store?: string | null;
    erpsent?: InvoiceErpSent | null;
    brandId?: number | null;
    lineDetails?: string | null;
    from?: string | null;
    to?: string | null;
    sortBy?: InvoiceSortField;
    sortDir?: InvoiceSortDirection;
    view?: InvoiceViewMode;
  }) {
    const params = new URLSearchParams();

    if (aggregator !== "wolt") {
      params.set("aggregator", aggregator);
    }

    if (invoiceNumber) {
      params.set("invoiceNumber", invoiceNumber);
    }

    if (store) {
      params.set("store", store);
    }

    if (erpsent) {
      params.set("erpsent", erpsent);
    }

    if (brandId) {
      params.set("brand", brandId.toString());
    }

    if (lineDetails) {
      params.set("lineDetails", lineDetails);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    if (sortBy && sortBy !== "documentdate") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "desc") {
      params.set("sortDir", sortDir);
    }

    if (view && view !== "table") {
      params.set("view", view);
    }

    if (page && page > 1) {
      params.set("page", page.toString());
    }

    const search = params.toString();

    return search
      ? `/aggregator-offers/invoices?${search}`
      : "/aggregator-offers/invoices";
  }

  function getPageHref(targetPage: number) {
    return getRouteHref({ page: targetPage });
  }

  function getSortHref(column: InvoiceSortField) {
    const nextDir: InvoiceSortDirection =
      data.sortBy === column && data.sortDir === "asc" ? "desc" : "asc";

    return getRouteHref({ page: 1, sortBy: column, sortDir: nextDir });
  }

  function selectAggregator(next: InvoiceAggregator) {
    if (next === data.filters.aggregator) {
      return;
    }

    goto(getRouteHref({ aggregator: next, page: 1 }));
  }

  function applyDateRange(range: { from?: string; to?: string }) {
    goto(
      getRouteHref({
        page: 1,
        from: range.from ?? null,
        to: range.to ?? null,
      }),
    );
  }

  function getVisiblePages() {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);

    return Array.from(
      { length: end - adjustedStart + 1 },
      (_, index) => adjustedStart + index,
    );
  }
</script>

<svelte:head>
  <title>Invoices | Aggregator Offers | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Processed aggregator invoices imported from Wolt and Bolt, with header filters and per-invoice line details."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a
        href="/aggregator-offers"
        class="hover:text-foreground transition-colors">Aggregator Offers</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Invoices</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Invoices
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Processed invoices imported from the aggregators, with their payout
        totals and journal lines. Click an invoice to inspect its full detail.
      </p>
    </section>

    <div class="space-y-2">
      <span class="text-sm font-medium">Aggregator</span>
      <ButtonGroup.Root>
        {#each invoiceAggregators as aggregator (aggregator)}
          <Button
            variant={data.filters.aggregator === aggregator
              ? "default"
              : "outline"}
            onclick={() => selectAggregator(aggregator)}
          >
            {invoiceAggregatorLabel(aggregator)}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]">
              {invoiceAggregatorLabel(data.filters.aggregator)} invoices
            </Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_minmax(0,13rem)_minmax(0,8rem)_minmax(0,11rem)_auto_auto_auto] lg:items-end"
          >
            <div class="space-y-2">
              <label class="text-sm font-medium" for="invoiceNumber"
                >Invoice #</label
              >
              <Input
                id="invoiceNumber"
                name="invoiceNumber"
                value={data.filters.invoiceNumber ?? ""}
                placeholder="Invoice number"
                oninput={handleSearchInput}
                onkeydown={handleSearchKeydown}
              />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="store">Store / BP</label>
              <Input
                id="store"
                name="store"
                value={data.filters.store ?? ""}
                placeholder="Store or BP name"
                oninput={handleSearchInput}
                onkeydown={handleSearchKeydown}
              />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="lineDetails"
                >Line details</label
              >
              <div class="relative">
                <SearchIcon
                  class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <Input
                  id="lineDetails"
                  name="lineDetails"
                  value={data.filters.lineDetails ?? ""}
                  placeholder="Search line details"
                  class="pl-9"
                  oninput={handleSearchInput}
                  onkeydown={handleSearchKeydown}
                />
              </div>
            </div>

            <div class="space-y-2"></div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="brand">Brand</label>
              <NativeSelect.Root
                id="brand"
                name="brand"
                value={data.brandId?.toString() ?? ""}
                onchange={handleSearchChange}
              >
                <NativeSelect.Option value="">All brands</NativeSelect.Option>
                {#each data.brands as brand (brand.id)}
                  <NativeSelect.Option value={brand.id.toString()}>
                    {formatBrandLabel(brand)}
                  </NativeSelect.Option>
                {/each}
              </NativeSelect.Root>
            </div>

            <div class="space-y-2">
              <span class="text-sm font-medium">Document date</span>
              <DateRangeFilter
                from={data.filters.from}
                to={data.filters.to}
                onApply={applyDateRange}
              />
            </div>

            {#if data.filters.aggregator !== "wolt"}
              <input
                type="hidden"
                name="aggregator"
                value={data.filters.aggregator}
              />
            {/if}
            {#if data.filters.from}
              <input type="hidden" name="from" value={data.filters.from} />
            {/if}
            {#if data.filters.to}
              <input type="hidden" name="to" value={data.filters.to} />
            {/if}
            <input type="hidden" name="sortBy" value={data.sortBy} />
            <input type="hidden" name="sortDir" value={data.sortDir} />
            {#if data.view !== "table"}
              <input type="hidden" name="view" value={data.view} />
            {/if}

            <div class="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button
                href={getRouteHref({
                  page: 1,
                  invoiceNumber: null,
                  store: null,
                  erpsent: null,
                  brandId: null,
                  lineDetails: null,
                  from: null,
                  to: null,
                })}
                variant="outline"
              >
                Reset
              </Button>
            </div>

            <div class="flex items-center gap-2">
              <span class="sr-only">View</span>
              <ButtonGroup.Root>
                <Button
                  href={getRouteHref({ view: "table" })}
                  variant={data.view === "table" ? "default" : "outline"}
                  aria-current={data.view === "table" ? "page" : undefined}
                >
                  <TableIcon class="size-4" />
                  Table
                </Button>
                <Button
                  href={getRouteHref({ view: "chart" })}
                  variant={data.view === "chart" ? "default" : "outline"}
                  aria-current={data.view === "chart" ? "page" : undefined}
                >
                  <ChartLineIcon class="size-4" />
                  Chart
                </Button>
              </ButtonGroup.Root>
              <Button
                type="button"
                variant="outline"
                onclick={() => (infoOpen = true)}
              >
                <InfoIcon class="size-4" />
                Info
              </Button>
            </div>
          </form>
        </div>
      </Card.Header>

      <Card.Content>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {invoiceAggregatorLabel(data.filters.aggregator)}
          </Badge>
          {#if data.filters.invoiceNumber}
            <Badge variant="outline">
              Invoice: {data.filters.invoiceNumber}
            </Badge>
          {/if}
          {#if data.filters.store}
            <Badge variant="outline">Store: {data.filters.store}</Badge>
          {/if}
          {#if data.filters.erpsent}
            <Badge variant="outline">
              ERP: {data.filters.erpsent === "Y" ? "Sent" : "Not sent"}
            </Badge>
          {/if}
          {#if selectedBrand}
            <Badge variant="outline">
              Brand: {formatBrandLabel(selectedBrand)}
            </Badge>
          {/if}
          {#if data.filters.lineDetails}
            <Badge variant="outline">Lines: {data.filters.lineDetails}</Badge>
          {/if}
          {#if data.filters.from || data.filters.to}
            <Badge variant="outline">
              {data.filters.from ?? "…"} – {data.filters.to ?? "…"}
            </Badge>
          {/if}
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} invoices
          </span>
          {#if data.invoicesPage.totalPayout !== null}
            <span class="text-muted-foreground text-sm">
              · <span class="text-foreground font-medium tabular-nums">
                {formatInvoiceAmount(data.invoicesPage.totalPayout)}
              </span> total payout
            </span>
          {/if}
        </div>

        {#if data.view === "chart" && data.trend}
          <InvoicesTrendChart trend={data.trend} />
        {:else}
          <InvoicesTable
            items={rows}
            sortBy={data.sortBy}
            sortDir={data.sortDir}
            from={data.filters.from}
            to={data.filters.to}
            {getSortHref}
          />
        {/if}

        {#if data.view !== "chart" && totalItems > 0}
          <div
            class="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end"
          >
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                href={getPageHref(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>

              {#each getVisiblePages() as visiblePage (visiblePage)}
                <Button
                  href={getPageHref(visiblePage)}
                  variant={visiblePage === page ? "default" : "outline"}
                  size="sm"
                >
                  {visiblePage}
                </Button>
              {/each}

              <Button
                variant="outline"
                href={getPageHref(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <InvoiceMetricsDialog
      bind:open={infoOpen}
      filters={data.filters}
      brandId={data.brandId}
      brandLabel={selectedBrand ? formatBrandLabel(selectedBrand) : null}
    />

    <ChatWidget
      agentId="invoices-agent"
      title="Invoices Assistant"
      greeting="Hi! Ask me anything about the Wolt and Bolt invoices — totals, stores, trends, ERP status…"
    />
  </main>
</div>
