<script lang="ts">
  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import ExploreGrid from "$lib/components/sales/explore-grid.svelte";
  import OffersAssistantDialog from "$lib/components/sales/offers-assistant-dialog.svelte";
  import ValueBreakdownDialog from "$lib/components/sales/value-breakdown-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatSalesAmount,
    formatSalesCount,
    salesDashboardSearch,
  } from "$lib/services/sales-dashboard";
  import {
    EXPLORE_AI_MAX_ORDERS,
    EXPLORE_EXPORT_MAX_ROWS,
    EXPLORE_PAGE_MAX_ROWS,
    type ExploreGridState,
    type ExploreOrder,
    type ExploreOrderOffer,
    type OfferFilter,
    describeExploreFilter,
    readExploreUrlFilters,
    writeExploreUrlFilters,
  } from "$lib/services/sales-explore";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
  import TicketPercentIcon from "@lucide/svelte/icons/ticket-percent";
  import XIcon from "@lucide/svelte/icons/x";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const endpoint = "/sales/explore";
  const filters = $derived(data.scope?.filters ?? null);
  const brandNames = $derived(
    Object.fromEntries(
      (data.scope?.brands ?? []).map((brand) => [brand.alias, brand.name]),
    ),
  );

  let gridState = $state<ExploreGridState | null>(null);
  let exporting = $state(false);
  let orderOpen = $state(false);
  let order = $state<ExploreOrder | null>(null);
  let orderLoading = $state(false);
  // Read once: later URL writes come from the grid itself (see syncUrl).
  const initial = readExploreUrlFilters(page.url.searchParams);
  let offerFilter = $state<OfferFilter | null>(initial.offers);
  let assistantOpen = $state(false);
  let breakdownOpen = $state(false);
  // Offers-column menu: the clicked offer and where to anchor the popover.
  let offerMenu = $state<{
    offer: ExploreOrderOffer;
    anchor: { getBoundingClientRect: () => DOMRect };
  } | null>(null);
  // Right-click on selected rows: their loaded pks and the selection size.
  let rowsMenu = $state<{
    pks: string[];
    selected: number;
    anchor: { getBoundingClientRect: () => DOMRect };
  } | null>(null);
  let aiOpen = $state(false);
  let chatWidget = $state<ReturnType<typeof ChatWidget>>();
  // Value breakdown of the selected orders only; null = the whole grid.
  let breakdownPks = $state<string[] | null>(null);
  let aiContext = $state<{ orders: string[] } | undefined>(undefined);
  const rowsMenuNote = $derived.by(() => {
    if (!rowsMenu) return "";
    const { pks, selected } = rowsMenu;
    if (selected > EXPLORE_PAGE_MAX_ROWS) {
      return `Select up to ${formatSalesCount(EXPLORE_PAGE_MAX_ROWS)} orders.`;
    }
    if (pks.length < selected) {
      return `${formatSalesCount(selected - pks.length)} not loaded yet; scroll through them to include them.`;
    }
    return "";
  });

  // Mirror what the grid just queried into the address bar. replaceState
  // leaves page.url alone, so the grid does not re-query; read location.
  function syncUrl(state: ExploreGridState) {
    gridState = state;
    const url = new URL(location.href);
    writeExploreUrlFilters(url.searchParams, state.filter, state.offers);
    if (url.search !== location.search) replaceState(url, page.state);
  }

  // Date range change: a real navigation that keeps the current filters.
  function applyRange(range: { from?: string | null; to?: string | null }) {
    if (!filters) return;
    const params = new URLSearchParams(
      salesDashboardSearch(
        // An empty range ("All time") falls back to the default window.
        { ...filters, from: range.from ?? "", to: range.to ?? "" },
        { allBrands: true },
      ),
    );
    writeExploreUrlFilters(
      params,
      gridState?.filter ?? initial.filter,
      offerFilter,
    );
    void goto(`${page.url.pathname}?${params}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  let grid = $state<ReturnType<typeof ExploreGrid>>();
  // Before the first fetch, show what was restored from the URL.
  const filterChips = $derived(
    describeExploreFilter(
      gridState?.filter ?? initial.filter,
      (colId, value) =>
        colId === "brand" ? (brandNames[value] ?? value) : value,
    ),
  );

  function clearAllFilters() {
    offerFilter = null;
    void grid?.clearAllFilters();
  }

  function openOfferMenu(offer: ExploreOrderOffer, x: number, y: number) {
    offerMenu = {
      offer,
      anchor: { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) },
    };
  }

  function filterOnlyOffer() {
    if (!offerMenu) return;
    offerFilter = {
      mode: "with",
      items: [offerMenu.offer.item],
      combo: offerFilter?.combo,
    };
    offerMenu = null;
  }

  const offerSummary = $derived.by(() => {
    if (!offerFilter) return "";
    const count = offerFilter.items.length;
    const offers = `${count} offer${count === 1 ? "" : "s"}`;
    const parts: string[] = [];
    switch (offerFilter.mode) {
      case "with":
        parts.push(`Only orders with ${offers}`);
        break;
      case "without":
        parts.push(`Excluding orders with ${offers}`);
        break;
      case "any":
        parts.push("Orders with any offer");
        break;
      case "none":
        parts.push("Orders with no offer");
        break;
    }
    if (offerFilter.combo === "only") parts.push("only combo orders");
    if (offerFilter.combo === "exclude") parts.push("no combo orders");
    return parts.join(" · ");
  });

  // What the Value breakdown dialog measures, in words.
  const breakdownScope = $derived(
    [
      `${formatSalesCount(gridState?.totalRows ?? 0)} orders`,
      filters ? `${filters.from} to ${filters.to}` : "",
      ...filterChips.map((chip) => `${chip.label}: ${chip.text}`),
      offerSummary,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  const tooManyToExport = $derived(
    (gridState?.totalRows ?? 0) > EXPLORE_EXPORT_MAX_ROWS,
  );

  async function exportExcel() {
    if (!gridState) return;
    if (tooManyToExport) {
      toast.error(
        `${formatSalesCount(gridState.totalRows)} orders match. Export takes up to ${formatSalesCount(EXPLORE_EXPORT_MAX_ROWS)}: narrow the filters or date range.`,
      );
      return;
    }
    await downloadExcel("export", {
      sort: gridState.sort,
      filter: gridState.filter,
      offers: gridState.offers,
    });
  }

  function openRowsMenu(pks: string[], selected: number, x: number, y: number) {
    rowsMenu = {
      pks,
      selected,
      anchor: { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) },
    };
  }

  async function exportSelected() {
    const pks = rowsMenu?.pks ?? [];
    rowsMenu = null;
    await downloadExcel("orders-export", { pks });
  }

  async function askAiAboutSelected() {
    // Frozen at click time: later selections do not change the conversation.
    aiContext = { orders: rowsMenu?.pks ?? [] };
    rowsMenu = null;
    await chatWidget?.startNewConversation();
    aiOpen = true;
  }

  function breakdownOfSelected() {
    breakdownPks = rowsMenu?.pks ?? null;
    rowsMenu = null;
    breakdownOpen = true;
  }

  /** POSTs an export request, then follows the returned download URL. */
  async function downloadExcel(path: string, body: unknown) {
    exporting = true;
    try {
      const response = await fetch(`${endpoint}/${path}${page.url.search}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Export failed (${response.status})`);
      }
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "The Excel export could not be generated.",
      );
    } finally {
      exporting = false;
    }
  }

  async function openOrder(pk: string) {
    order = null;
    orderOpen = true;
    orderLoading = true;
    try {
      const response = await fetch(
        `${endpoint}/order?pk=${encodeURIComponent(pk)}`,
      );
      if (!response.ok) throw new Error(String(response.status));
      order = (await response.json()) as ExploreOrder;
    } catch {
      orderOpen = false;
      toast.error("Could not load the order.");
    } finally {
      orderLoading = false;
    }
  }

  const headerFields = $derived(
    order
      ? [
          ["Date", `${order.header.day} ${order.header.time}`],
          [
            "Brand",
            brandNames[String(order.header.brand)] ?? order.header.brand,
          ],
          ["Store", order.header.store],
          ["Channel", `${order.header.channel} · ${order.header.division}`],
          ["Payment", order.header.payment],
          ["Receipt method", order.header.receipt_method],
          ["Type", order.header.type],
          ["Receipt", order.header.receipt],
        ]
      : [],
  );
</script>

<svelte:head>
  <title>Sales Explorer | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Sales Explorer
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Every POS order for your brands. Filter and sort with the column headers;
      click an order number to see its items. Amounts are net of VAT.
    </p>
  </section>

  {#if !filters}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You are not assigned to any brand yet, so there are no sales to show.
        Ask an admin to assign your brands.
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-2">
        <span class="text-sm font-medium">Date range</span>
        <DateRangeFilter
          from={filters.from}
          to={filters.to}
          onApply={applyRange}
        />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-muted-foreground text-sm" aria-live="polite">
          {gridState ? `${formatSalesCount(gridState.totalRows)} orders` : ""}
          {#if tooManyToExport}
            <span class="block text-xs">
              Export takes up to {formatSalesCount(EXPLORE_EXPORT_MAX_ROWS)} orders.
              Narrow the filters or date range.
            </span>
          {/if}
        </p>
        <Button variant="outline" onclick={() => (assistantOpen = true)}>
          <TicketPercentIcon class="size-4" />
          Offers Assistant
        </Button>
        <Button
          variant={offerFilter ? "secondary" : "outline"}
          disabled={!gridState || gridState.totalRows === 0}
          title={gridState?.totalRows === 0 ? "No orders match" : undefined}
          onclick={() => {
            breakdownPks = null;
            breakdownOpen = true;
          }}
        >
          <ChartPieIcon class="size-4" />
          Value breakdown
        </Button>
        <Button
          variant="outline"
          disabled={exporting || !gridState || gridState.totalRows === 0}
          onclick={exportExcel}
        >
          {#if exporting}
            <LoaderCircleIcon class="size-4 animate-spin" />
          {:else}
            <DownloadIcon class="size-4" />
          {/if}
          Export to Excel
        </Button>
      </div>
    </div>

    {#if filterChips.length > 0 || offerFilter}
      <div
        class="flex flex-wrap items-center gap-2"
        role="region"
        aria-label="Applied filters"
      >
        <span class="text-muted-foreground text-sm">Filters:</span>
        {#each filterChips as chip (chip.colId)}
          <Badge variant="secondary" class="max-w-80 gap-1" title={chip.text}>
            <span class="truncate">
              <span class="font-semibold">{chip.label}:</span>
              {chip.text}
            </span>
            <button
              type="button"
              class="hover:text-foreground shrink-0 rounded-sm"
              aria-label={`Remove ${chip.label} filter`}
              onclick={() => grid?.clearFilter(chip.colId)}
            >
              <XIcon class="size-3" />
            </button>
          </Badge>
        {/each}
        {#if offerFilter}
          <Badge variant="secondary" class="gap-1">
            <span>
              <span class="font-semibold">Offers &amp; combos:</span>
              {offerSummary}
            </span>
            <button
              type="button"
              class="hover:text-foreground rounded-sm"
              aria-label="Remove offers filter"
              onclick={() => (offerFilter = null)}
            >
              <XIcon class="size-3" />
            </button>
          </Badge>
        {/if}
        <Button variant="ghost" size="sm" onclick={clearAllFilters}>
          Clear all
        </Button>
      </div>
    {/if}

    <div class="overflow-hidden rounded-xl border">
      <ExploreGrid
        bind:this={grid}
        {endpoint}
        search={page.url.search}
        {brandNames}
        offers={offerFilter}
        columnState={data.columnState}
        initialFilter={initial.filter}
        onOpenOrder={openOrder}
        onOfferMenu={openOfferMenu}
        onRowsMenu={openRowsMenu}
        onState={syncUrl}
      />
    </div>

    <Popover.Root
      open={rowsMenu !== null}
      onOpenChange={(open) => {
        if (!open) rowsMenu = null;
      }}
    >
      <Popover.Content
        customAnchor={rowsMenu?.anchor ?? null}
        align="start"
        class="w-72 p-1"
      >
        <p class="text-muted-foreground px-2 py-1.5 text-xs">
          {formatSalesCount(rowsMenu?.selected ?? 0)}
          {rowsMenu?.selected === 1 ? "order" : "orders"} selected
          {#if rowsMenuNote}
            <span class="block">{rowsMenuNote}</span>
          {/if}
        </p>
        <button
          type="button"
          class="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50"
          disabled={exporting || !rowsMenu?.pks.length}
          onclick={exportSelected}
        >
          <DownloadIcon class="size-4" />
          Export to Excel (all lines)
        </button>
        <button
          type="button"
          class="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50"
          disabled={!rowsMenu?.pks.length}
          onclick={breakdownOfSelected}
        >
          <ChartPieIcon class="size-4" />
          Value breakdown
        </button>
        <button
          type="button"
          class="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none disabled:pointer-events-none disabled:opacity-50"
          disabled={!rowsMenu?.pks.length ||
            rowsMenu.pks.length > EXPLORE_AI_MAX_ORDERS}
          title={(rowsMenu?.pks.length ?? 0) > EXPLORE_AI_MAX_ORDERS
            ? `Ask AI takes up to ${EXPLORE_AI_MAX_ORDERS} orders`
            : undefined}
          onclick={askAiAboutSelected}
        >
          <SparklesIcon class="size-4" />
          Ask AI
          {#if (rowsMenu?.pks.length ?? 0) > EXPLORE_AI_MAX_ORDERS}
            <span class="text-muted-foreground ml-auto text-xs">
              max {EXPLORE_AI_MAX_ORDERS}
            </span>
          {/if}
        </button>
      </Popover.Content>
    </Popover.Root>

    <ChatWidget
      bind:this={chatWidget}
      agentId="sales-agent"
      title="Sales Assistant"
      greeting={aiContext
        ? `Ask me about the ${aiContext.orders.length} selected order${aiContext.orders.length === 1 ? "" : "s"}: items, offers, discounts, totals…`
        : "Hi! Right-click selected orders and choose Ask AI, or ask anything about your sales."}
      bind:open={aiOpen}
      context={aiContext}
    />

    <Popover.Root
      open={offerMenu !== null}
      onOpenChange={(open) => {
        if (!open) offerMenu = null;
      }}
    >
      <Popover.Content
        customAnchor={offerMenu?.anchor ?? null}
        align="start"
        class="w-64 p-1"
      >
        <p class="text-muted-foreground truncate px-2 py-1.5 text-xs">
          {offerMenu?.offer.name}
        </p>
        <button
          type="button"
          class="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none"
          onclick={filterOnlyOffer}
        >
          <TicketPercentIcon class="size-4" />
          Filter only this offer
        </button>
      </Popover.Content>
    </Popover.Root>

    <ValueBreakdownDialog
      bind:open={breakdownOpen}
      {endpoint}
      search={page.url.search}
      filter={gridState?.filter ?? {}}
      offers={offerFilter}
      pks={breakdownPks}
      scope={breakdownPks
        ? `${formatSalesCount(breakdownPks.length)} selected ${breakdownPks.length === 1 ? "order" : "orders"}`
        : breakdownScope}
    />

    <OffersAssistantDialog
      bind:open={assistantOpen}
      {endpoint}
      search={page.url.search}
      filter={gridState?.filter ?? {}}
      current={offerFilter}
      onApply={(next) => (offerFilter = next)}
    />
  {/if}
</main>

<Dialog.Root bind:open={orderOpen}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>
        Order {order?.header.order_no ?? ""}
      </Dialog.Title>
      <Dialog.Description>
        Line values are before order-level discounts, so they may not add up to
        the order net.
      </Dialog.Description>
    </Dialog.Header>

    {#if orderLoading}
      <div class="flex justify-center py-10">
        <LoaderCircleIcon class="text-muted-foreground size-6 animate-spin" />
      </div>
    {:else if order}
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {#each headerFields as [label, value] (label)}
          <div>
            <dt class="text-muted-foreground text-xs">{label}</dt>
            <dd class="font-medium">{value || "—"}</dd>
          </div>
        {/each}
      </dl>

      {#if order.lines.some((line) => line.isCombo)}
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground text-xs">Combo order</span>
          {#each order.lines.filter((line) => line.isCombo) as line (`${line.line}-${line.subLine}`)}
            <Badge variant="outline">{line.name || line.item}</Badge>
          {/each}
        </div>
      {/if}

      {#if order.lines.some((line) => line.isOffer)}
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground text-xs">Offers</span>
          {#each order.lines.filter((line) => line.isOffer) as line (`${line.line}-${line.subLine}`)}
            <Badge class={line.voided ? "line-through opacity-60" : ""}>
              {line.name || line.item}
            </Badge>
          {/each}
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {#each [["Net", order.header.net], ["Discount", order.header.discount], ["VAT", order.header.vat], ["Total", order.header.total]] as [label, value] (label)}
          <div class="bg-muted/50 rounded-lg px-3 py-2">
            <p class="text-muted-foreground text-xs">{label}</p>
            <p class="text-base font-semibold">
              {formatSalesAmount(Number(value))}
            </p>
          </div>
        {/each}
      </div>

      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Item</Table.Head>
            <Table.Head>Category</Table.Head>
            <Table.Head class="text-right">Qty</Table.Head>
            <Table.Head class="text-right">Net</Table.Head>
            <Table.Head class="text-right">Discount</Table.Head>
            <Table.Head></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each order.lines as line (`${line.line}-${line.subLine}`)}
            <Table.Row
              class={line.voided ? "text-muted-foreground line-through" : ""}
            >
              <Table.Cell class={line.comboItem ? "pl-8" : ""}>
                <span class="font-medium">{line.name || line.item}</span>
                <span class="text-muted-foreground text-xs"> {line.item}</span>
                {#if line.comment && line.comment !== line.name}
                  <p class="text-muted-foreground text-xs">{line.comment}</p>
                {/if}
              </Table.Cell>
              <Table.Cell>{line.category}</Table.Cell>
              <Table.Cell class="text-right">{line.qty}</Table.Cell>
              <Table.Cell class="text-right"
                >{formatSalesAmount(line.net)}</Table.Cell
              >
              <Table.Cell class="text-right">
                {line.discount ? formatSalesAmount(line.discount) : ""}
              </Table.Cell>
              <Table.Cell class="space-x-1 text-right">
                {#if line.isOffer}<Badge>Offer</Badge>{/if}
                {#if line.voided}<Badge variant="outline">Voided</Badge>{/if}
                {#if line.isCoupon || line.coupon}<Badge variant="secondary"
                    >Coupon</Badge
                  >{/if}
                {#if line.isCombo}<Badge variant="outline">Combo</Badge>{/if}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={6} class="text-muted-foreground text-center">
                No item lines recorded for this order.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Dialog.Content>
</Dialog.Root>
