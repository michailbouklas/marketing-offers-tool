<script lang="ts">
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    formatMoney,
    formatNumber,
    formatPct,
    formatRating,
    kpiSubRoutes,
    type KpiSubRouteKey,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const stats = $derived(data.stats);

  const statCards = $derived([
    { label: "Stores", value: formatNumber(stats.storeCount) },
    { label: "Foody", value: formatNumber(stats.foodyCount) },
    { label: "Wolt", value: formatNumber(stats.woltCount) },
    { label: "Reviews", value: formatNumber(stats.totalReviews) },
  ]);

  function metricFor(key: KpiSubRouteKey): { value: string; label: string } {
    switch (key) {
      case "metrics":
        return {
          value: formatMoney(stats.latestFoodyWeeklySales),
          label: "latest week sales (Foody)",
        };
      case "closures":
        return {
          value: formatPct(stats.avgOfflineOpenHoursPct),
          label: "avg offline in open hours",
        };
      case "order-rejections":
        return {
          value: formatPct(stats.avgCancellationsPct),
          label: "avg cancellations",
        };
      case "punctuality":
        return {
          value: formatPct(stats.avgAvoidableWaitOrdersPct),
          label: "avg avoidable-wait orders",
        };
      case "pro-growth":
        return {
          value: formatPct(stats.proOrderSharePct),
          label: "Foody Pro order share",
        };
      case "ratings":
        return {
          value: formatRating(stats.avgStoreRating),
          label: "avg store rating",
        };
      case "reviews":
        return {
          value: formatNumber(stats.totalReviews),
          label: "reviews captured",
        };
      default:
        return { value: "—", label: "" };
    }
  }

  const cards = $derived(
    kpiSubRoutes.map((route) => ({ ...route, metric: metricFor(route.key) })),
  );
</script>

<svelte:head>
  <title>Aggregator KPIs | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Merchant performance KPIs scraped from Foody and Wolt: closures, order rejections, punctuality, ratings, and reviews."
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
    <section class="space-y-3">
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        Aggregator KPIs
      </Badge>
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Aggregator KPIs
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Merchant performance by completed week or month — sales, how often
          stores go offline, get orders rejected, run late, and how customers
          rate them.
        </p>
        <p class="text-muted-foreground/80 max-w-3xl text-sm leading-6">
          Metrics, closures, rejections, punctuality, and ratings are currently
          <span class="font-medium">Foody-only</span>; a store missing from a
          period means that section produced no data that scrape, not a zero.
        </p>
      </div>
    </section>

    <KpiStatCards data={statCards} />

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each cards as card (card.key)}
        <a
          href={card.href}
          class="border-border/70 bg-background/88 hover:bg-background group flex h-full flex-col justify-between rounded-3xl border p-6 shadow-sm backdrop-blur transition-colors"
        >
          <div class="space-y-4">
            <Badge
              variant="outline"
              class="border-primary/20 bg-background/85 text-muted-foreground px-3 py-1 text-[0.7rem] tracking-[0.24em] uppercase shadow-sm"
            >
              {card.eyebrow}
            </Badge>

            <div class="space-y-1">
              <p class="text-lg font-semibold tracking-[-0.02em]">
                {card.label}
              </p>
              <div class="flex items-baseline gap-2">
                <span class="text-4xl font-semibold tracking-[-0.04em]">
                  {card.metric.value}
                </span>
                <span class="text-muted-foreground text-sm">
                  {card.metric.label}
                </span>
              </div>
            </div>

            <p class="text-muted-foreground text-sm leading-6">
              {card.description}
            </p>
          </div>

          <div class="mt-6 inline-flex items-center gap-2 text-sm font-medium">
            <span>View {card.label.toLowerCase()}</span>
            <ArrowRightIcon
              class="size-4 transition-transform group-hover:translate-x-1"
            />
          </div>
        </a>
      {/each}
    </section>
  </main>
</div>
