<script lang="ts">
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import KpiTrendChart from "$lib/components/aggregator-kpis/widgets/kpi-trend-chart.svelte";
  import SessionFilterBar from "$lib/components/aggregator-kpis/widgets/session-filter-bar.svelte";
  import SessionsTable from "$lib/components/aggregator-kpis/widgets/sessions-table.svelte";
  import { formatNumber } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.view.rows);
  const trend = $derived(data.view.trend);
  const totals = $derived(data.view.totals);

  const statCards = $derived([
    { label: "Total sessions", value: formatNumber(totals.sessions) },
    {
      label: "Completed",
      value: formatNumber(totals.completed),
      hint:
        totals.running > 0 ? `${formatNumber(totals.running)} running` : null,
    },
    { label: "Failed", value: formatNumber(totals.failed) },
    { label: "Stores scraped", value: formatNumber(totals.storesScraped) },
  ]);
</script>

<svelte:head>
  <title>Sessions | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Scrape session health across Foody and Wolt: which runs completed, how long they took, and how their stores broke down by outcome."
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
      <span>Sessions</span>
    </div>

    <section class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Sessions
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Scrape session health across each aggregator: which runs completed,
        whether they were interrupted or crashed, how long they took, and how
        the stores in each run broke down by outcome.
      </p>
    </section>

    <SessionFilterBar filters={data.filters} />

    <KpiStatCards data={statCards} />

    <KpiTrendChart
      title="Stores scraped per day"
      description="Total OK stores across sessions started on each day."
      label="Stores"
      decimals={0}
      data={trend}
    />

    <SessionsTable data={rows} />
  </main>
</div>
