<script lang="ts">
  import { page } from "$app/state";
  import GaControlsBar from "$lib/components/google-analytics/ga-controls-bar.svelte";
  import GaBreakdownTable from "$lib/components/google-analytics/widgets/ga-breakdown-table.svelte";
  import GaDailyTrendChart from "$lib/components/google-analytics/widgets/ga-daily-trend-chart.svelte";
  import GaStatTiles from "$lib/components/google-analytics/widgets/ga-stat-tiles.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { googleAnalyticsRangeLabels } from "$lib/services/google-analytics/google-analytics";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const periodLabel = $derived(
    googleAnalyticsRangeLabels[data.filters.range].toLowerCase(),
  );
</script>

<svelte:head>
  <title>Google Analytics | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Per-brand Google Analytics 4 overview: users, sessions, engagement, key events, and where traffic comes from."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="space-y-3">
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        Google Analytics
      </Badge>
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Google Analytics
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          How each brand's website is doing in Google Analytics 4: who visits,
          how engaged they are, and where they come from. Pick a brand and a
          period; brands with several GA4 properties get a property switch.
        </p>
      </div>
    </section>

    {#if data.brands.length === 0}
      <Card.Root>
        <Card.Header>
          <Card.Title>No Google Analytics data available to you</Card.Title>
          <Card.Description>
            This page shows only brands assigned to you that have an active GA4
            property. Ask an admin to assign the brand to your account under
            Admin → Users, and to link its GA4 property under Admin → Brands.
          </Card.Description>
        </Card.Header>
      </Card.Root>
    {:else}
      <GaControlsBar
        brands={data.brands}
        filters={data.filters}
        basePath={page.url.pathname}
      />

      {#if data.loadError}
        <Alert.Root variant="destructive">
          <TriangleAlertIcon />
          <Alert.Title>Google Analytics could not be loaded</Alert.Title>
          <Alert.Description>{data.loadError}</Alert.Description>
        </Alert.Root>
      {:else if data.dashboard && data.property}
        <div class="space-y-6">
          <div
            class="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-sm"
          >
            <span class="text-foreground font-medium"
              >{data.property.displayName}</span
            >
            <span>· GA4 property {data.property.propertyId}</span>
            <span>· {periodLabel}, through yesterday</span>
          </div>

          <GaStatTiles totals={data.dashboard.totals} />

          <GaDailyTrendChart data={data.dashboard.daily} />

          <div class="grid gap-6 lg:grid-cols-2">
            <GaBreakdownTable
              title="Traffic channels"
              description="Sessions by default channel group."
              labelHeader="Channel"
              rows={data.dashboard.channels}
              totalSessions={data.dashboard.totals.sessions}
            />
            <GaBreakdownTable
              title="Top pages"
              description="The ten most visited page paths."
              labelHeader="Page path"
              rows={data.dashboard.pages}
              totalSessions={data.dashboard.totals.sessions}
            />
            <GaBreakdownTable
              title="Devices"
              description="Sessions by device category."
              labelHeader="Device"
              rows={data.dashboard.devices}
              totalSessions={data.dashboard.totals.sessions}
            />
            <GaBreakdownTable
              title="Countries"
              description="The ten countries sending the most sessions."
              labelHeader="Country"
              rows={data.dashboard.countries}
              totalSessions={data.dashboard.totals.sessions}
            />
          </div>

          <p class="text-muted-foreground/80 text-xs leading-5">
            Figures come from the Google Analytics Data API and end yesterday
            because GA4 reports the current day only partially. Results are
            cached for {data.cacheTtlMinutes} minutes.
          </p>
        </div>
      {/if}
    {/if}
  </main>
</div>
