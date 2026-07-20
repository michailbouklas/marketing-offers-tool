<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInvoiceAmount,
    invoiceAggregatorLabel,
    type InvoiceFilters,
    type InvoiceMetrics,
  } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import { fetchInvoiceMetrics } from "$lib/services/aggregator-invoices/invoice-details";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
  import { scaleUtc } from "d3-scale";
  import { LineChart, Spline } from "layerchart";
  import { SvelteMap } from "svelte/reactivity";

  type BreakdownSortField = "label" | "lineItemCount" | "totalAmount";
  type SortDirection = "asc" | "desc";

  let {
    open = $bindable(false),
    filters,
    brandId,
    brandLabel,
  }: {
    open?: boolean;
    filters: InvoiceFilters;
    brandId: number | null;
    brandLabel: string | null;
  } = $props();

  let metrics = $state<InvoiceMetrics | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let requestSequence = 0;
  let sortField = $state<BreakdownSortField>("totalAmount");
  let sortDirection = $state<SortDirection>("desc");
  const metricsCache = new SvelteMap<string, InvoiceMetrics>();

  const periodLabel = $derived(
    filters.from || filters.to
      ? `${filters.from ?? "Any date"} – ${filters.to ?? "Today"}`
      : "All dates",
  );
  const activeFilterLabels = $derived(
    [
      brandLabel,
      filters.invoiceNumber ? `Invoice: ${filters.invoiceNumber}` : null,
      filters.store ? `Store: ${filters.store}` : null,
      filters.erpsent
        ? `ERP: ${filters.erpsent === "Y" ? "Sent" : "Not sent"}`
        : null,
      filters.lineDetails ? `Lines: ${filters.lineDetails}` : null,
    ].filter((label): label is string => label !== null),
  );
  const sortedTransactionTypes = $derived.by(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;

    return [...(metrics?.transactionTypes ?? [])].sort((left, right) => {
      if (sortField === "label") {
        return (
          (left.transactionType ?? "").localeCompare(
            right.transactionType ?? "",
          ) * multiplier
        );
      }

      return (left[sortField] - right[sortField]) * multiplier;
    });
  });

  // Count (~hundreds) and payout (~millions) can't share a y-axis, so the
  // trend renders as two stacked charts over the same time buckets. Buckets
  // are monthly, or daily when the filtered period spans less than 2 months.
  const trendGranularity = $derived(
    metrics?.payoutTrend.granularity ?? "month",
  );
  const trendData = $derived(
    (metrics?.payoutTrend.points ?? []).map((item) => ({
      date: new Date(`${item.period}T00:00:00Z`),
      totalPayout: item.totalPayout,
      invoiceCount: item.invoiceCount,
    })),
  );

  const payoutChartConfig = {
    totalPayout: { label: "Total payout", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  const countChartConfig = {
    invoiceCount: { label: "Invoices", color: "var(--chart-2)" },
  } satisfies Chart.ChartConfig;

  const MAX_AXIS_TICKS = 8;
  const trendTicks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(trendData.length / MAX_AXIS_TICKS));
    return trendData
      .filter((_, index) => index % step === 0)
      .map((item) => item.date);
  });

  const compactAmountFormatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
  });

  const formatTrendAxis = $derived((v: Date) =>
    v.toLocaleDateString(
      "en-US",
      trendGranularity === "month"
        ? { month: "short", year: "2-digit", timeZone: "UTC" }
        : { month: "short", day: "numeric", timeZone: "UTC" },
    ),
  );

  const formatTrendTooltip = $derived((v: Date) =>
    v.toLocaleDateString(
      "en-US",
      trendGranularity === "month"
        ? { month: "long", year: "numeric", timeZone: "UTC" }
        : { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
    ),
  );

  function toggleSort(field: BreakdownSortField) {
    sortDirection =
      sortField === field && sortDirection === "desc" ? "asc" : "desc";
    sortField = field;
  }

  function ariaSort(field: BreakdownSortField) {
    if (sortField !== field) {
      return "none" as const;
    }

    return sortDirection === "asc"
      ? ("ascending" as const)
      : ("descending" as const);
  }

  function cacheKey() {
    return JSON.stringify([filters, brandId]);
  }

  async function loadMetrics() {
    const key = cacheKey();
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
      const result = await fetchInvoiceMetrics(filters, brandId);
      metricsCache.set(key, result);

      if (requestId === requestSequence) {
        metrics = result;
      }
    } catch {
      if (requestId === requestSequence) {
        loadError = "Failed to load invoice metrics. Close and try again.";
      }
    } finally {
      if (requestId === requestSequence) {
        loading = false;
      }
    }
  }

  $effect(() => {
    if (open) {
      void loadMetrics();
    }
  });
</script>

{#snippet sortButton(field: BreakdownSortField, label: string)}
  <Button
    variant="ghost"
    size="sm"
    class="-mx-2"
    onclick={() => toggleSort(field)}
  >
    {label}
    {#if sortField !== field}
      <ArrowUpDownIcon data-icon="inline-end" />
    {:else if sortDirection === "asc"}
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
        Filtered invoices
        <Badge variant="outline">
          {invoiceAggregatorLabel(filters.aggregator)}
        </Badge>
        {#each activeFilterLabels as label (label)}
          <Badge variant="outline">{label}</Badge>
        {/each}
      </Dialog.Title>
      <Dialog.Description>
        Invoice performance for {periodLabel}, across all invoices matching the
        current filters.
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
          <h3 class="font-medium">
            {trendGranularity === "month" ? "Monthly" : "Daily"} payout trend
          </h3>
          <p class="text-muted-foreground text-sm">
            Invoice count and payout total per
            {trendGranularity === "month" ? "month" : "day"} for the selected period.
          </p>
        </div>

        {#if trendData.length < 2}
          <p class="text-muted-foreground text-sm">
            Not enough history to chart for the current filters.
          </p>
        {:else}
          <div class="space-y-1 rounded-xl border p-4">
            <p class="text-muted-foreground text-xs tracking-wide uppercase">
              Total payout
            </p>
            <Chart.Container config={payoutChartConfig} class="h-36 w-full">
              <LineChart
                data={trendData}
                x="date"
                xScale={scaleUtc()}
                yPadding={[0, 12]}
                series={[
                  {
                    key: "totalPayout",
                    label: "Total payout",
                    color: "var(--color-totalPayout)",
                  },
                ]}
                props={{
                  xAxis: { format: formatTrendAxis, ticks: trendTicks },
                  yAxis: {
                    format: (v: number) => compactAmountFormatter.format(v),
                  },
                }}
              >
                {#snippet marks({ context })}
                  {#each context.series.visibleSeries as s (s.key)}
                    <Spline
                      seriesKey={s.key}
                      class="stroke-2"
                      stroke={s.color}
                    />
                  {/each}
                {/snippet}
                {#snippet tooltip()}
                  <Chart.Tooltip
                    indicator="dot"
                    labelFormatter={formatTrendTooltip}
                  >
                    {#snippet formatter({ value, name, item })}
                      <div
                        style="--color-bg: {item.color}"
                        class="size-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
                      ></div>
                      <div
                        class="flex flex-1 items-center justify-between leading-none"
                      >
                        <span class="text-muted-foreground">{name}</span>
                        <span
                          class="text-foreground font-mono font-medium tabular-nums"
                        >
                          {formatInvoiceAmount(
                            typeof value === "number" ? value : null,
                          )}
                        </span>
                      </div>
                    {/snippet}
                  </Chart.Tooltip>
                {/snippet}
              </LineChart>
            </Chart.Container>

            <p
              class="text-muted-foreground pt-3 text-xs tracking-wide uppercase"
            >
              Invoice count
            </p>
            <Chart.Container config={countChartConfig} class="h-36 w-full">
              <LineChart
                data={trendData}
                x="date"
                xScale={scaleUtc()}
                yDomain={[0, null]}
                yPadding={[0, 12]}
                series={[
                  {
                    key: "invoiceCount",
                    label: "Invoices",
                    color: "var(--color-invoiceCount)",
                  },
                ]}
                props={{
                  xAxis: { format: formatTrendAxis, ticks: trendTicks },
                }}
              >
                {#snippet marks({ context })}
                  {#each context.series.visibleSeries as s (s.key)}
                    <Spline
                      seriesKey={s.key}
                      class="stroke-2"
                      stroke={s.color}
                    />
                  {/each}
                {/snippet}
                {#snippet tooltip()}
                  <Chart.Tooltip
                    indicator="dot"
                    labelFormatter={formatTrendTooltip}
                  />
                {/snippet}
              </LineChart>
            </Chart.Container>
          </div>
        {/if}
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
                <Table.Head aria-sort={ariaSort("label")}>
                  {@render sortButton("label", "Transaction type")}
                </Table.Head>
                <Table.Head
                  class="text-right"
                  aria-sort={ariaSort("lineItemCount")}
                >
                  <div class="flex justify-end">
                    {@render sortButton("lineItemCount", "Line items")}
                  </div>
                </Table.Head>
                <Table.Head
                  class="text-right"
                  aria-sort={ariaSort("totalAmount")}
                >
                  <div class="flex justify-end">
                    {@render sortButton("totalAmount", "Total amount")}
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
                    No line items were found for the current filters.
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
    {/if}
  </Dialog.Content>
</Dialog.Root>
