<script lang="ts">
  import CancellationReasonsCard from "$lib/components/aggregator-kpis/widgets/cancellation-reasons-card.svelte";
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import KpiTrendChart from "$lib/components/aggregator-kpis/widgets/kpi-trend-chart.svelte";
  import OrderRejectionsHistoryTable from "$lib/components/aggregator-kpis/widgets/order-rejections-history-table.svelte";
  import ReasonTrendChart from "$lib/components/aggregator-kpis/widgets/reason-trend-chart.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    aggregatorLabel,
    averageValues,
    formatKpiDateTime,
    formatMoney,
    formatNumber,
    formatPct,
    sumValues,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const store = $derived(data.store);
  const storeTitle = $derived(store.name ?? `Store #${store.id}`);
  const points = $derived(data.view.points);
  const trend = $derived(data.view.trend);
  const reasonBreakdown = $derived(data.view.reasonBreakdown);
  const reasonTrend = $derived(data.view.reasonTrend);

  const statCards = $derived([
    { label: "Snapshots", value: points.length.toString() },
    {
      label: "Latest cancellations",
      value: formatNumber(points[0]?.cancellationsCount),
      hint: formatPct(points[0]?.cancellationsPct),
    },
    {
      label: "Avg cancellations",
      value: formatPct(
        averageValues(points.map((point) => point.cancellationsPct)),
      ),
    },
    {
      label: "Total lost sales",
      value: formatMoney(sumValues(points.map((point) => point.lostSales))),
    },
  ]);
</script>

<svelte:head>
  <title
    >{storeTitle} Order Rejections | Aggregator KPIs | Aggregator Offers Tool</title
  >
  <meta
    name="description"
    content="Full order-rejections history for {storeTitle} from aggregator KPI scraping."
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
        href="/aggregator-kpis/order-rejections"
        class="hover:text-foreground transition-colors">Order Rejections</a
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
        {points.length} captured order-rejections snapshot{points.length === 1
          ? ""
          : "s"} for this store, showing how its cancellation rate and lost sales
        moved over time.
      </p>
    </section>

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

        <KpiTrendChart
          title="Cancellations over time"
          description="Daily average cancellation rate for this store."
          label="Cancellations %"
          unit="%"
          data={trend}
        />

        {#if reasonBreakdown && reasonBreakdown.cancellationsCount !== null}
          <CancellationReasonsCard breakdown={reasonBreakdown} />
        {/if}

        {#if reasonTrend.series.length > 0}
          <ReasonTrendChart
            trend={reasonTrend}
            title="Cancellation reasons over time"
            description="Cancellations per reason, by snapshot."
          />
        {/if}

        <OrderRejectionsHistoryTable data={points} />
      </div>
    </section>
  </main>
</div>
