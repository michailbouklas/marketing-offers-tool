<script lang="ts">
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import PeriodToggle from "$lib/components/aggregator-kpis/widgets/period-toggle.svelte";
  import PeriodTrendChart from "$lib/components/aggregator-kpis/widgets/period-trend-chart.svelte";
  import ProGrowthTable from "$lib/components/aggregator-kpis/widgets/pro-growth-table.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    formatPct,
    newCustomerShare,
    periodKindLabel,
    proOrderShare,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const store = $derived(data.store);
  const storeTitle = $derived(store.name ?? `Store #${store.id}`);
  const period = $derived(data.period);
  const rows = $derived(data.view.rows);
  const proShareTrend = $derived(data.view.proShareTrend);
  const newShareTrend = $derived(data.view.newShareTrend);

  const latest = $derived(rows[0] ?? null);
  const notOnPro = $derived(latest?.proBoxFound === false);

  const statCards = $derived([
    { label: "Periods", value: rows.length.toString() },
    {
      label: "Latest Pro share",
      value: notOnPro
        ? "Not on Pro"
        : formatPct(proOrderShare(latest ? [latest] : [])),
    },
    {
      label: "Latest new-customer share",
      value: formatPct(newCustomerShare(latest ? [latest] : [])),
    },
    {
      label: "Pro order share",
      value: formatPct(proOrderShare(rows)),
      hint: "all periods, from sums",
    },
  ]);
</script>

<svelte:head>
  <title
    >{storeTitle} Pro Growth | Aggregator KPIs | Aggregator Offers Tool</title
  >
  <meta
    name="description"
    content="Foody Pro adoption and new vs. returning customer mix history for {storeTitle}."
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
      <a
        href="/aggregator-kpis/pro-growth"
        class="hover:text-foreground transition-colors">Pro Growth</a
      >
      <ChevronRightIcon class="size-3" />
      <span class="normal-case">{storeTitle}</span>
    </div>

    <section class="space-y-3">
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        {aggregatorLabel(store.aggregator)}
      </Badge>
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {storeTitle}
        </h1>
      </div>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Foody Pro adoption and new vs. returning customer mix, per completed {periodKindLabel(
          period,
        ).toLowerCase()} period.
      </p>
    </section>

    <PeriodToggle
      {period}
      basePath={`/aggregator-kpis/pro-growth/${store.id}`}
    />

    <section class="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <Card.Root class="h-fit">
        <Card.Header>
          <Card.Title>Store details</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Platform</dt>
              <dd class="text-right font-medium">
                {aggregatorLabel(store.aggregator)}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Store id</dt>
              <dd class="text-right font-mono text-xs">{store.id}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">External id</dt>
              <dd class="text-right font-mono text-xs break-all">
                {store.externalId}
              </dd>
            </div>
            {#if store.slug}
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground shrink-0">Slug</dt>
                <dd class="text-right font-mono text-xs break-all">
                  {store.slug}
                </dd>
              </div>
            {/if}
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">First scraped</dt>
              <dd class="text-right font-medium">
                {formatKpiDateTime(store.createdAt)}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-muted-foreground shrink-0">Last updated</dt>
              <dd class="text-right font-medium">
                {formatKpiDateTime(store.updatedAt)}
              </dd>
            </div>
          </dl>

          {#if store.url}
            <a
              href={store.url}
              target="_blank"
              rel="noreferrer"
              class="text-primary mt-4 inline-block text-sm hover:underline"
            >
              View on {aggregatorLabel(store.aggregator)}
            </a>
          {/if}
        </Card.Content>
      </Card.Root>

      <div class="flex flex-col gap-6">
        <KpiStatCards data={statCards} />

        <PeriodTrendChart
          title="Pro order share over time"
          description="Share of orders placed by Foody Pro subscribers per completed period."
          label="Pro share"
          unit="%"
          decimals={1}
          {period}
          data={proShareTrend}
        />

        <PeriodTrendChart
          title="New-customer share over time"
          description="Share of orders from first-time customers per completed period."
          label="New-customer share"
          unit="%"
          decimals={1}
          {period}
          data={newShareTrend}
        />

        <ProGrowthTable
          title="Period history"
          description="Every completed period captured for this store."
          data={rows}
          {period}
          hideStore
        />
      </div>
    </section>
  </main>
</div>
