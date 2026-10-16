<script lang="ts">
  import { enhance } from "$app/forms";
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
  import GaRefreshPoller from "$lib/components/google-analytics/widgets/ga-refresh-poller.svelte";
  import GaStatTiles from "$lib/components/google-analytics/widgets/ga-stat-tiles.svelte";
  import GaWidgetFrame from "$lib/components/google-analytics/widgets/ga-widget-frame.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    googleAnalyticsRangeDays,
    googleAnalyticsRangeLabels,
    type GoogleAnalyticsDashboardStatus,
  } from "$lib/services/google-analytics/google-analytics";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const periodLabel = $derived(
    googleAnalyticsRangeLabels[data.filters.range].toLowerCase(),
  );
  const comparisonLabel = $derived(
    `vs previous ${googleAnalyticsRangeDays[data.filters.range]} days`,
  );

  /** Latest answer from the status poll while widgets are pending. */
  let refreshStatus = $state<GoogleAnalyticsDashboardStatus | null>(null);

  const retryHint = $derived.by(() => {
    const job = refreshStatus?.job;
    if (!job) return null;
    if (job.status === "running") return "retrying now";
    if (job.status === "failed") return "automatic retries stopped";
    if (job.status !== "pending") return null;

    const at = new Date(job.nextRunAt);
    if (at.getTime() <= Date.now()) return "retrying shortly";

    return `next retry ${at.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}${job.attempts > 0 ? `, attempt ${job.attempts + 1}` : ""}`;
  });

  function confirmClearCaches({ cancel }: { cancel: () => void }) {
    if (
      !confirm(
        "Clear every cached Google Analytics report and queued retry? The next load of each dashboard will ask Google again.",
      )
    ) {
      cancel();
    }
  }
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
      <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <GaControlsBar
          brands={data.brands}
          filters={data.filters}
          basePath={page.url.pathname}
        />

        {#if data.isAdmin}
          <!-- Admin / superUser only; the server re-checks the role. Hidden
               inputs bring the user back to the same brand / property / range. -->
          <form
            method="POST"
            action="?/clearCache"
            use:enhance={confirmClearCaches}
          >
            <input
              type="hidden"
              name="brand"
              value={data.filters.brandId ?? ""}
            />
            <input
              type="hidden"
              name="property"
              value={data.filters.propertyId ?? ""}
            />
            <input type="hidden" name="range" value={data.filters.range} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              title="Drop every cached Google Analytics report and queued retry (all properties)"
            >
              <TrashIcon aria-hidden="true" />
              Clear GA caches
            </Button>
          </form>
        {/if}
      </div>

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
        {:then loaded}
          {#if loaded?.error}
            <Alert.Root variant="destructive">
              <TriangleAlertIcon />
              <Alert.Title>Google Analytics could not be loaded</Alert.Title>
              <Alert.Description>{loaded.error}</Alert.Description>
            </Alert.Root>
          {:else if loaded?.result}
            {@const dashboard = loaded.result.dashboard}
            {@const widgets = loaded.result.widgets}
            {@const pending = loaded.result.pendingKeys.length > 0}

            <GaRefreshPoller
              brandId={data.brand.id}
              propertyRowId={data.property.id}
              range={data.filters.range}
              active={pending}
              onstatus={(status) => (refreshStatus = status)}
            />

            {#if pending}
              <Alert.Root>
                <TriangleAlertIcon />
                <Alert.Title>Some widgets are waiting for Google</Alert.Title>
                <Alert.Description>
                  Google Analytics refused {loaded.result.pendingKeys.length} of 11
                  reports (quota). They are queued and this page refreshes itself
                  when they arrive{retryHint ? ` — ${retryHint}` : ""}.
                </Alert.Description>
              </Alert.Root>
            {/if}

            <div class="space-y-6">
              <GaWidgetFrame state={widgets.daily} title="Overview" {retryHint}>
                <GaStatTiles
                  totals={dashboard.totals}
                  previousTotals={dashboard.previousTotals}
                  {comparisonLabel}
                />
              </GaWidgetFrame>

              <div
                class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
              >
                <GaWidgetFrame
                  state={widgets.daily}
                  title="Daily trend"
                  {retryHint}
                >
                  <GaDailyTrendChart data={dashboard.daily} />
                </GaWidgetFrame>
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
                <GaWidgetFrame
                  state={widgets.channels}
                  title="Traffic channels"
                  {retryHint}
                >
                  <GaBreakdownTable
                    title="Traffic channels"
                    description="Sessions by default channel group."
                    labelHeader="Channel"
                    rows={dashboard.channels}
                    totalSessions={dashboard.totals.sessions}
                  />
                </GaWidgetFrame>
                <GaWidgetFrame
                  state={widgets.landingPages}
                  title="Landing pages"
                  {retryHint}
                >
                  <GaLandingPagesTable
                    rows={dashboard.landingPages}
                    totalSessions={dashboard.totals.sessions}
                  />
                </GaWidgetFrame>
              </div>
              <GaWidgetFrame
                state={widgets.campaigns}
                title="Campaigns"
                {retryHint}
              >
                <GaCampaignsTable
                  rows={dashboard.campaigns}
                  totalSessions={dashboard.totals.sessions}
                />
              </GaWidgetFrame>

              {@render sectionHeading(
                "Behaviour",
                "When people visit, what they look at, and what they do.",
              )}
              <GaWidgetFrame
                state={widgets.heatmap}
                title="Sessions by weekday and hour"
                {retryHint}
              >
                <GaHeatmap cells={dashboard.heatmap} />
              </GaWidgetFrame>
              <div class="grid gap-6 lg:grid-cols-2">
                <GaWidgetFrame
                  state={widgets.pages}
                  title="Top pages & screens"
                  {retryHint}
                >
                  <GaBreakdownTable
                    title="Top pages & screens"
                    description="The ten most visited page titles (web) and screen names (app)."
                    labelHeader="Page / screen"
                    shareHeader="% of sessions"
                    rows={dashboard.pages}
                    totalSessions={dashboard.totals.sessions}
                  />
                </GaWidgetFrame>
                <GaWidgetFrame
                  state={widgets.keyEventsByName}
                  title="Key events"
                  {retryHint}
                >
                  <GaKeyEventsTable
                    rows={dashboard.keyEventsByName}
                    totalKeyEvents={dashboard.totals.keyEvents}
                  />
                </GaWidgetFrame>
              </div>

              {@render sectionHeading(
                "Audience",
                "Who the visitors are and where they are.",
              )}
              <div class="grid gap-6 lg:grid-cols-2">
                <GaWidgetFrame
                  state={widgets.newVsReturning}
                  title="New vs returning"
                  {retryHint}
                >
                  <GaDonut segments={dashboard.newVsReturning} />
                </GaWidgetFrame>
                <GaWidgetFrame
                  state={widgets.devices}
                  title="Devices"
                  {retryHint}
                >
                  <GaBreakdownTable
                    title="Devices"
                    description="Sessions by device category."
                    labelHeader="Device"
                    rows={dashboard.devices}
                    totalSessions={dashboard.totals.sessions}
                  />
                </GaWidgetFrame>
                <GaWidgetFrame
                  state={widgets.cities}
                  title="Cities"
                  {retryHint}
                >
                  <GaBreakdownTable
                    title="Cities"
                    description="The ten cities sending the most sessions."
                    labelHeader="City"
                    rows={dashboard.cities}
                    totalSessions={dashboard.totals.sessions}
                  />
                </GaWidgetFrame>
                <GaWidgetFrame
                  state={widgets.countries}
                  title="Countries"
                  {retryHint}
                >
                  <GaBreakdownTable
                    title="Countries"
                    description="The ten countries sending the most sessions."
                    labelHeader="Country"
                    rows={dashboard.countries}
                    totalSessions={dashboard.totals.sessions}
                  />
                </GaWidgetFrame>
              </div>

              <p class="text-muted-foreground/80 text-xs leading-5">
                Figures come from the Google Analytics Data API and end
                yesterday because GA4 reports the current day only partially.
                Period changes compare with the {googleAnalyticsRangeDays[
                  data.filters.range
                ]} days before. Reports are cached for {data.cacheTtlHours} hours
                (and kept across restarts); when Google's quota is exhausted the last
                copy is shown and a refresh is retried in the background. The live
                card refreshes every minute.
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
