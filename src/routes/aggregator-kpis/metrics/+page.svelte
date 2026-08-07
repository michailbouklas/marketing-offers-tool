<script lang="ts">
  import KpiPeriodFilterBar from "$lib/components/aggregator-kpis/widgets/kpi-period-filter-bar.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import MetricsTable from "$lib/components/aggregator-kpis/widgets/metrics-table.svelte";
  import PeriodTrendChart from "$lib/components/aggregator-kpis/widgets/period-trend-chart.svelte";
  import {
    formatMoney,
    formatNumber,
    formatPeriodLong,
    periodKindLabel,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const view = $derived(data.view);
  const totals = $derived(view.totals);
  const period = $derived(view.period);
  const isWolt = $derived(data.aggregator === "WOLT");

  const periodLabel = $derived(
    totals.periodStart
      ? formatPeriodLong(totals.periodStart, totals.periodEnd ?? "", period)
      : "No completed period yet",
  );

  // Wolt's "completed orders" is today-scoped at scrape time (handoff §4.2), so
  // it is not comparable to the period figures — omit it for Wolt.
  const statCards = $derived([
    { label: "Sales", value: formatMoney(totals.sales), hint: periodLabel },
    {
      label: "Orders",
      value: formatNumber(totals.orders),
      hint: `${totals.storeCount} store${totals.storeCount === 1 ? "" : "s"}`,
    },
    { label: "Avg basket", value: formatMoney(totals.avgBasketSize) },
    ...(isWolt
      ? []
      : [
          {
            label: "Completed orders",
            value: formatNumber(totals.completedOrders),
          },
        ]),
  ]);
</script>

<svelte:head>
  <title>Metrics | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Foody sales, orders, and average basket per completed week or month."
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
      <span>Metrics</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Metrics
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Sales, orders, and average basket size for each completed {periodKindLabel(
          period,
        ).toLowerCase()} period — one exact number per period, no re-scrape double-counting.
      </p>
    </section>

    <KpiPeriodFilterBar
      stores={data.stores}
      brands={data.brands}
      filters={data.filters}
      basePath="/aggregator-kpis/metrics"
    />

    <KpiStatCards data={statCards} />

    <div class="grid gap-6 lg:grid-cols-2">
      <PeriodTrendChart
        title="Sales over time"
        description="Total sales per completed period across the selected stores."
        label="Sales"
        prefix="€"
        {period}
        data={view.salesTrend}
      />
      <PeriodTrendChart
        title="Orders over time"
        description="Total orders per completed period across the selected stores."
        label="Orders"
        {period}
        data={view.ordersTrend}
      />
    </div>

    <MetricsTable data={view.rows} {period} linkStores />
  </main>
</div>
