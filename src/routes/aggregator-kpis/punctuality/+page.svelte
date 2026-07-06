<script lang="ts">
  import KpiFilterBar from "$lib/components/aggregator-kpis/widgets/kpi-filter-bar.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import KpiTrendChart from "$lib/components/aggregator-kpis/widgets/kpi-trend-chart.svelte";
  import PunctualityTable from "$lib/components/aggregator-kpis/widgets/punctuality-table.svelte";
  import {
    averageValues,
    formatDuration,
    formatPct,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.view.rows);
  const trend = $derived(data.view.trend);

  const statCards = $derived([
    { label: "Stores with data", value: rows.length.toString() },
    {
      label: "Avg avoidable-wait orders",
      value: formatPct(
        averageValues(rows.map((row) => row.avoidableWaitOrdersPct)),
      ),
    },
    {
      label: "Avg avoidable wait",
      value: formatDuration(
        averageValues(rows.map((row) => row.avgAvoidableWaitSeconds)),
      ),
    },
  ]);
</script>

<svelte:head>
  <title>Punctuality | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Share of orders with avoidable waiting time and the average avoidable wait across Foody and Wolt."
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
      <span>Punctuality</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Punctuality
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        The share of orders that ran into avoidable waiting time, and how long
        that avoidable wait was on average.
      </p>
    </section>

    <KpiFilterBar
      stores={data.stores}
      filters={data.filters}
      basePath="/aggregator-kpis/punctuality"
    />

    <KpiStatCards data={statCards} />

    <KpiTrendChart
      title="Avoidable-wait orders over time"
      description="Daily average share of orders with avoidable waiting time."
      label="Avoidable-wait %"
      unit="%"
      data={trend}
    />

    <PunctualityTable data={rows} />
  </main>
</div>
