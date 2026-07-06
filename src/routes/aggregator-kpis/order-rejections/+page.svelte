<script lang="ts">
  import KpiFilterBar from "$lib/components/aggregator-kpis/widgets/kpi-filter-bar.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import KpiTrendChart from "$lib/components/aggregator-kpis/widgets/kpi-trend-chart.svelte";
  import OrderRejectionsTable from "$lib/components/aggregator-kpis/widgets/order-rejections-table.svelte";
  import {
    averageValues,
    formatMoney,
    formatNumber,
    formatPct,
    sumValues,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.view.rows);
  const trend = $derived(data.view.trend);

  const statCards = $derived([
    { label: "Stores with data", value: rows.length.toString() },
    {
      label: "Avg cancellations",
      value: formatPct(averageValues(rows.map((row) => row.cancellationsPct))),
    },
    {
      label: "Total lost sales",
      value: formatMoney(sumValues(rows.map((row) => row.lostSales))),
    },
    {
      label: "Reason unknown",
      value: formatNumber(sumValues(rows.map((row) => row.reasonUnknownCount))),
    },
  ]);
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
        Cancellation rates, the sales lost to them, and orders rejected for
        reasons the aggregator could not attribute.
      </p>
    </section>

    <KpiFilterBar
      stores={data.stores}
      filters={data.filters}
      basePath="/aggregator-kpis/order-rejections"
    />

    <KpiStatCards data={statCards} />

    <KpiTrendChart
      title="Cancellations over time"
      description="Daily average cancellation rate across the stores."
      label="Cancellations %"
      unit="%"
      data={trend}
    />

    <OrderRejectionsTable data={rows} />
  </main>
</div>
