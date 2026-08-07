<script lang="ts">
  import ClosuresTable from "$lib/components/aggregator-kpis/widgets/closures-table.svelte";
  import KpiPeriodFilterBar from "$lib/components/aggregator-kpis/widgets/kpi-period-filter-bar.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import PeriodTrendChart from "$lib/components/aggregator-kpis/widgets/period-trend-chart.svelte";
  import PerDayStackedBars from "$lib/components/aggregator-kpis/widgets/per-day-stacked-bars.svelte";
  import {
    averageValues,
    formatDuration,
    formatDurationDHM,
    formatPct,
    formatSalesLoss,
    periodKindLabel,
    sumValues,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.view.rows);
  const trend = $derived(data.view.trend);
  const period = $derived(data.view.period);
  const isWolt = $derived(data.aggregator === "WOLT");

  const statCards = $derived([
    { label: "Stores with data", value: rows.length.toString() },
    {
      label: isWolt ? "Avg unavailability" : "Avg offline in open hours",
      value: formatPct(
        averageValues(rows.map((row) => row.offlineOpenHoursPct)),
      ),
    },
    {
      label: "Total offline",
      value: formatDurationDHM(
        sumValues(rows.map((row) => row.offlineDurationSeconds)),
      ),
    },
    // Wolt quantifies € lost to unavailability; Foody exposes unreachable time.
    isWolt
      ? {
          label: "Money lost",
          value: formatSalesLoss(sumValues(rows.map((row) => row.lossAmount))),
        }
      : {
          label: "Total unreachable",
          value: formatDuration(
            sumValues(rows.map((row) => row.unreachableSeconds)),
          ),
        },
  ]);

  // Wolt per-day unavailability split (app-not-live vs manually offline).
  const perDayClosures = $derived(
    (data.view.perDay ?? []).map((day) => ({
      date: day.date,
      values: {
        appNotLive: day.appNotLiveSeconds ?? 0,
        manualOffline: day.manualOfflineSeconds ?? 0,
      },
      loss: day.lossAmount,
    })),
  );

  const closureSegments = [
    { key: "appNotLive", label: "App not live", color: "var(--chart-1)" },
    {
      key: "manualOffline",
      label: "Manually offline",
      color: "var(--chart-2)",
    },
  ];
</script>

<svelte:head>
  <title>Closures | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="How often Foody stores go offline during their advertised open hours, per completed period."
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
      <span>Closures</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Closures
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        How often stores go offline during their advertised open hours{isWolt
          ? " and the money lost to it"
          : ", and the total time they were unreachable"} — one exact number per completed
        {periodKindLabel(period).toLowerCase()} period.
      </p>
    </section>

    <KpiPeriodFilterBar
      stores={data.stores}
      brands={data.brands}
      filters={data.filters}
      basePath="/aggregator-kpis/closures"
    />

    <KpiStatCards data={statCards} />

    <PeriodTrendChart
      title={isWolt ? "Unavailability over time" : "Offline time over time"}
      description="Total offline hours per completed period across the selected stores."
      label="Offline hours"
      unit="h"
      decimals={1}
      {period}
      data={trend}
    />

    {#if isWolt}
      <PerDayStackedBars
        title="Unavailability by day"
        description="Daily split of app-not-live vs manually-offline time for the latest completed period."
        segments={closureSegments}
        days={perDayClosures}
        formatValue={formatDuration}
      />
    {/if}

    <ClosuresTable data={rows} {period} linkStores />
  </main>
</div>
