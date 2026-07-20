<script lang="ts">
  import KpiPeriodFilterBar from "$lib/components/aggregator-kpis/widgets/kpi-period-filter-bar.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import LostSalesByReasonWidget from "$lib/components/aggregator-kpis/widgets/lost-sales-by-reason-widget.svelte";
  import OrderRejectionsTable from "$lib/components/aggregator-kpis/widgets/order-rejections-table.svelte";
  import PeriodTrendChart from "$lib/components/aggregator-kpis/widgets/period-trend-chart.svelte";
  import PerDayStackedBars from "$lib/components/aggregator-kpis/widgets/per-day-stacked-bars.svelte";
  import {
    averageValues,
    formatMoney,
    formatNumber,
    formatPct,
    periodKindLabel,
    sumValues,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.view.rows);
  const trend = $derived(data.view.trend);
  const lostSalesByReason = $derived(data.view.lostSalesByReason);
  const period = $derived(data.view.period);
  const isWolt = $derived(data.aggregator === "WOLT");

  const statCards = $derived(
    isWolt
      ? [
          { label: "Stores with data", value: rows.length.toString() },
          {
            label: "Total rejections",
            value: formatNumber(
              sumValues(rows.map((row) => row.cancellationsCount)),
            ),
          },
          {
            label: "Avg late orders",
            value: formatPct(
              averageValues(rows.map((row) => row.lateOrdersPct)),
            ),
          },
          {
            label: "Total lost sales",
            value: formatMoney(sumValues(rows.map((row) => row.lostSales))),
          },
        ]
      : [
          { label: "Stores with data", value: rows.length.toString() },
          {
            label: "Total cancellations",
            value: formatNumber(
              sumValues(rows.map((row) => row.cancellationsCount)),
            ),
          },
          {
            label: "Avg cancellations",
            value: formatPct(
              averageValues(rows.map((row) => row.cancellationsPct)),
            ),
          },
          {
            label: "Total lost sales",
            value: formatMoney(sumValues(rows.map((row) => row.lostSales))),
          },
        ],
  );

  // Wolt per-day rejections split (auto- vs actively-rejected).
  const perDayRejections = $derived(
    (data.view.perDay ?? []).map((day) => ({
      date: day.date,
      values: {
        autoRejected: day.autoRejected ?? 0,
        activelyRejected: day.activelyRejected ?? 0,
      },
      loss: day.lossAmount,
    })),
  );

  const rejectionSegments = [
    { key: "autoRejected", label: "Auto-rejected", color: "var(--chart-1)" },
    {
      key: "activelyRejected",
      label: "Actively rejected",
      color: "var(--chart-2)",
    },
  ];
</script>

<svelte:head>
  <title>Order Rejections | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Cancellation rates, lost sales, and orders rejected for unknown reasons across Foody and Wolt."
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
      <a href="/aggregator-kpis" class="hover:text-foreground transition-colors"
        >Aggregator KPIs</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Order Rejections</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Order Rejections
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        {#if isWolt}
          Avoidable rejections, late orders and preparation time, plus the sales
          lost — per completed {periodKindLabel(period).toLowerCase()} period.
        {:else}
          Cancellation rates, the sales lost to them, and orders rejected for
          reasons the aggregator could not attribute — per completed {periodKindLabel(
            period,
          ).toLowerCase()} period.
        {/if}
      </p>
    </section>

    <KpiPeriodFilterBar
      stores={data.stores}
      filters={data.filters}
      basePath="/aggregator-kpis/order-rejections"
    />

    <KpiStatCards data={statCards} />

    <PeriodTrendChart
      title="Lost sales over time"
      description="Total sales lost to rejections per completed period across the stores."
      label="Lost sales"
      prefix="€"
      {period}
      data={trend}
    />

    {#if isWolt}
      <PerDayStackedBars
        title="Rejections by day"
        description="Daily split of auto- vs actively-rejected orders for the latest completed period."
        segments={rejectionSegments}
        days={perDayRejections}
        formatValue={formatNumber}
      />
    {:else}
      <LostSalesByReasonWidget data={lostSalesByReason} />
    {/if}

    <OrderRejectionsTable data={rows} {period} linkStores />
  </main>
</div>
