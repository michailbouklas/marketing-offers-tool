<script lang="ts">
  import KpiPeriodFilterBar from "$lib/components/aggregator-kpis/widgets/kpi-period-filter-bar.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import PeriodTrendChart from "$lib/components/aggregator-kpis/widgets/period-trend-chart.svelte";
  import ProGrowthTable from "$lib/components/aggregator-kpis/widgets/pro-growth-table.svelte";
  import {
    formatNumber,
    formatPct,
    newCustomerShare,
    periodKindLabel,
    proOrderShare,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.view.rows);
  const proShareTrend = $derived(data.view.proShareTrend);
  const newShareTrend = $derived(data.view.newShareTrend);
  const period = $derived(data.view.period);

  const storesOnPro = $derived(
    rows.filter((row) => row.proBoxFound === true).length,
  );

  const statCards = $derived([
    { label: "Stores with data", value: rows.length.toString() },
    { label: "Stores on Pro", value: formatNumber(storesOnPro) },
    {
      label: "Pro order share",
      value: formatPct(proOrderShare(rows)),
      hint: "from sums",
    },
    {
      label: "New-customer share",
      value: formatPct(newCustomerShare(rows)),
      hint: "from sums",
    },
  ]);
</script>

<svelte:head>
  <title>Pro Growth | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Foody Pro subscription adoption and the new vs. returning customer mix per completed week or month."
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
      <span>Pro Growth</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Pro Growth
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Foody Pro subscription adoption and the share of orders from first-time
        vs. returning customers — per completed {periodKindLabel(
          period,
        ).toLowerCase()} period. Each share has its own denominator; stores not on
        Foody Pro are shown as "Not on Pro", never zero. Foody only.
      </p>
    </section>

    <KpiPeriodFilterBar
      stores={data.stores}
      filters={data.filters}
      basePath="/aggregator-kpis/pro-growth"
    />

    <KpiStatCards data={statCards} />

    <PeriodTrendChart
      title="Pro order share over time"
      description="Order-weighted share of orders placed by Foody Pro subscribers per completed period."
      label="Pro share"
      unit="%"
      decimals={1}
      {period}
      data={proShareTrend}
    />

    <PeriodTrendChart
      title="New-customer share over time"
      description="Order-weighted share of orders from first-time customers per completed period (all-time first-order rule)."
      label="New-customer share"
      unit="%"
      decimals={1}
      {period}
      data={newShareTrend}
    />

    <ProGrowthTable data={rows} {period} linkStores />
  </main>
</div>
