<script lang="ts">
  import { page } from "$app/state";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import GaControlsBar from "$lib/components/google-analytics/ga-controls-bar.svelte";
  import GaBreakdownTable from "$lib/components/google-analytics/widgets/ga-breakdown-table.svelte";
  import GaCampaignsTable from "$lib/components/google-analytics/widgets/ga-campaigns-table.svelte";
  import GaDailyTrendChart from "$lib/components/google-analytics/widgets/ga-daily-trend-chart.svelte";
  import GaDashboardSkeleton from "$lib/components/google-analytics/widgets/ga-dashboard-skeleton.svelte";
  import GaDonut from "$lib/components/google-analytics/widgets/ga-donut.svelte";
  import GaHeatmap from "$lib/components/google-analytics/widgets/ga-heatmap.svelte";
  import GaKeyEventsTable from "$lib/components/google-analytics/widgets/ga-key-events-table.svelte";
  import GaLandingPagesTable from "$lib/components/google-analytics/widgets/ga-landing-pages-table.svelte";
  import GaLiveNowCard from "$lib/components/google-analytics/widgets/ga-live-now-card.svelte";
  import GaStatTiles from "$lib/components/google-analytics/widgets/ga-stat-tiles.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    googleAnalyticsRangeDays,
    googleAnalyticsRangeLabels,
  } from "$lib/services/google-analytics/google-analytics";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const periodLabel = $derived(
    googleAnalyticsRangeLabels[data.filters.range].toLowerCase(),
  );
  const comparisonLabel = $derived(
    `vs previous ${googleAnalyticsRangeDays[data.filters.range]} days`,
  );
</script>

{#snippet sectionHeading(label: string, hint: string)}
  <div class="flex flex-wrap items-baseline gap-x-3 pt-2">
    <h2 class="text-sm font-semibold tracking-[0.18em] uppercase">{label}</h2>
    <p class="text-muted-foreground text-sm">{hint}</p>
  </div>
{/snippet}

<svelte:head>
  <title>Google Analytics | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Per-brand Google Analytics 4 overview: users, sessions, engagement, key events, campaigns, landing pages, and where and when traffic comes from."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_26%)]"
  ></div>

  <div
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

      {#if data.property && data.brand}
        <div
          class="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-sm"
        >
          <span class="text-foreground font-medium"
            >{data.property.displayName}</span
          >
          <span>· GA4 property {data.property.propertyId}</span>
          <span>· {periodLabel}, through yesterday</span>
        </div>

        {#await data.streamed.dashboard}
          <GaDashboardSkeleton propertyName={data.property.displayName} />
        {:then result}
          {#if result?.error}
            <Alert.Root variant="destructive">
              <TriangleAlertIcon />
              <Alert.Title>Google Analytics could not be loaded</Alert.Title>
              <Alert.Description>{result.error}</Alert.Description>
            </Alert.Root>
          {:else if result?.dashboard}
            {@const dashboard = result.dashboard}
            <div class="space-y-6">
              <GaStatTiles
                totals={dashboard.totals}
                previousTotals={dashboard.previousTotals}
                {comparisonLabel}
              />

              <div
                class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
              >
                <GaDailyTrendChart data={dashboard.daily} />
                <GaLiveNowCard
                  brandId={data.brand.id}
                  propertyRowId={data.property.id}
                  propertyName={data.property.displayName}
                />
              </div>

              {@render sectionHeading(
                "Acquisition",
                "Where sessions come from and which pages they start on.",
              )}
              <div class="grid gap-6 lg:grid-cols-2">
                <GaBreakdownTable
                  title="Traffic channels"
                  description="Sessions by default channel group."
                  labelHeader="Channel"
                  rows={dashboard.channels}
                  totalSessions={dashboard.totals.sessions}
                />
                <GaLandingPagesTable
                  rows={dashboard.landingPages}
                  totalSessions={dashboard.totals.sessions}
                />
              </div>
              <GaCampaignsTable
                rows={dashboard.campaigns}
                totalSessions={dashboard.totals.sessions}
              />

              {@render sectionHeading(
                "Behaviour",
                "When people visit, what they look at, and what they do.",
              )}
              <GaHeatmap cells={dashboard.heatmap} />
              <div class="grid gap-6 lg:grid-cols-2">
                <GaBreakdownTable
                  title="Top pages & screens"
                  description="The ten most visited page titles (web) and screen names (app)."
                  labelHeader="Page / screen"
                  shareHeader="% of sessions"
                  rows={dashboard.pages}
                  totalSessions={dashboard.totals.sessions}
                />
                <GaKeyEventsTable
                  rows={dashboard.keyEventsByName}
                  totalKeyEvents={dashboard.totals.keyEvents}
                />
              </div>

              {@render sectionHeading(
                "Audience",
                "Who the visitors are and where they are.",
              )}
              <div class="grid gap-6 lg:grid-cols-2">
                <GaDonut segments={dashboard.newVsReturning} />
                <GaBreakdownTable
                  title="Devices"
                  description="Sessions by device category."
                  labelHeader="Device"
                  rows={dashboard.devices}
                  totalSessions={dashboard.totals.sessions}
                />
                <GaBreakdownTable
                  title="Cities"
                  description="The ten cities sending the most sessions."
                  labelHeader="City"
                  rows={dashboard.cities}
                  totalSessions={dashboard.totals.sessions}
                />
                <GaBreakdownTable
                  title="Countries"
                  description="The ten countries sending the most sessions."
                  labelHeader="Country"
                  rows={dashboard.countries}
                  totalSessions={dashboard.totals.sessions}
                />
              </div>

              <p class="text-muted-foreground/80 text-xs leading-5">
                Figures come from the Google Analytics Data API and end
                yesterday because GA4 reports the current day only partially.
                Period changes compare with the {googleAnalyticsRangeDays[
                  data.filters.range
                ]} days before. Results are cached for {data.cacheTtlMinutes} minutes;
                the live card refreshes every minute.
              </p>
            </div>
          {/if}
        {/await}
      {/if}

      <!-- The assistant receives the page's current filters as defaults; property
           access is still enforced server-side against the user's own scope. -->
      <ChatWidget
        agentId="google-analytics-agent"
        title="Google Analytics Assistant"
        greeting="Hi! Ask me about this brand's Google Analytics — visitors, traffic sources, campaigns, pages, what's live right now…"
        placeholder="e.g. Which channels grew the most in the last 28 days?"
        context={{
          brand: data.filters.brandId,
          property: data.filters.propertyId,
          range: data.filters.range,
        }}
      />
    {/if}
  </div>
</div>
