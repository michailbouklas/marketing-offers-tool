<script lang="ts">
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import MetricsTable from "$lib/components/aggregator-kpis/widgets/metrics-table.svelte";
  import PeriodTrendChart from "$lib/components/aggregator-kpis/widgets/period-trend-chart.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    aggregatorLabel,
    formatKpiDateTime,
    formatMoney,
    formatNumber,
    formatPeriodLong,
    periodKindLabel,
    periodKinds,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const store = $derived(data.store);
  const storeTitle = $derived(store.name ?? `Store #${store.id}`);
  const period = $derived(data.period);
  const view = $derived(data.view);
  const latest = $derived(view.latest);

  function periodHref(next: (typeof periodKinds)[number]): string {
    const params = new URLSearchParams();
    if (next !== "week") {
      params.set("period", next);
    }
    const search = params.toString();
    return search
      ? `/aggregator-kpis/metrics/${store.id}?${search}`
      : `/aggregator-kpis/metrics/${store.id}`;
  }

  const latestLabel = $derived(
    latest
      ? formatPeriodLong(latest.periodStart, latest.periodEnd, period)
      : "No completed period yet",
  );

  const statCards = $derived([
    { label: "Sales", value: formatMoney(latest?.sales), hint: latestLabel },
    { label: "Orders", value: formatNumber(latest?.orders) },
    { label: "Avg basket", value: formatMoney(latest?.avgBasketSize) },
    { label: "Completed orders", value: formatNumber(latest?.completedOrders) },
  ]);
</script>

<svelte:head>
  <title>{storeTitle} Metrics | Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Foody sales and orders history for {storeTitle} per completed period."
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
        href="/aggregator-kpis/metrics"
        class="hover:text-foreground transition-colors">Metrics</a
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
        Sales and orders for each completed {periodKindLabel(
          period,
        ).toLowerCase()} period.
      </p>
    </section>

    <div class="space-y-2">
      <span class="text-sm font-medium">Period</span>
      <ButtonGroup.Root>
        {#each periodKinds as kind (kind)}
          <Button
            href={periodHref(kind)}
            variant={period === kind ? "default" : "outline"}
          >
            {periodKindLabel(kind)}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

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

        <div class="grid gap-6 lg:grid-cols-2">
          <PeriodTrendChart
            title="Sales over time"
            description="Total sales per completed period."
            label="Sales"
            prefix="€"
            {period}
            data={view.salesTrend}
          />
          <PeriodTrendChart
            title="Orders over time"
            description="Total orders per completed period."
            label="Orders"
            {period}
            data={view.ordersTrend}
          />
        </div>

        <PeriodTrendChart
          title="Average basket over time"
          description="Average basket size per completed period."
          label="Avg basket"
          prefix="€"
          decimals={2}
          {period}
          data={view.basketTrend}
        />

        <MetricsTable
          title="Period history"
          description="Every completed period captured for this store."
          data={view.points}
          {period}
          showPeriod
        />
      </div>
    </section>
  </main>
</div>
