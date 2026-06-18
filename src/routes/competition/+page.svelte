<script lang="ts">
  import ActiveOffersByAggregatorWidget from "$lib/components/competition/widgets/active-offers-by-aggregator-widget.svelte";
  import MyNotificationsWidget from "$lib/components/competition/widgets/my-notifications-widget.svelte";
  import RecentOfferChangesWidget from "$lib/components/competition/widgets/recent-offer-changes-widget.svelte";
  import StatCardsWidget from "$lib/components/competition/widgets/stat-cards-widget.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const stats = $derived(data.stats);

  // v1 renders a fixed widget set; the per-user layout stored in
  // `competition_dashboard_widget` replaces this list in phase 2.
</script>

<svelte:head>
  <title>Competition | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Competitive landscape across aggregators: active offers, restaurants, and recent offer changes."
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
    <section class="flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Competition analytics
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Competition
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            What competitors are running on the aggregators right now — scraped
            menus, offers, and how they change over time.
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <Button href="/competition/offers" variant="outline"
          >Active offers</Button
        >
        <Button href="/competition/restaurants" variant="outline"
          >Restaurants</Button
        >
      </div>
    </section>

    <StatCardsWidget data={stats.totals} />

    <MyNotificationsWidget data={data.notifications} />

    <section class="grid gap-6 xl:grid-cols-2">
      <ActiveOffersByAggregatorWidget data={stats.activeOffersByProcessor} />
      <RecentOfferChangesWidget data={stats.recentChanges} />
    </section>
  </main>
</div>
