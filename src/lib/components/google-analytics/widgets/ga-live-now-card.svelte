<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    formatInteger,
    type GoogleAnalyticsRealtime,
  } from "$lib/services/google-analytics/google-analytics";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  /** How often an open tab asks for a fresh snapshot (server caches 30 s). */
  const POLL_INTERVAL_MS = 60_000;

  let {
    brandId,
    propertyRowId,
    propertyName,
  }: {
    brandId: number;
    propertyRowId: string;
    propertyName: string;
  } = $props();

  let realtime = $state<GoogleAnalyticsRealtime | null>(null);
  let loadError = $state<string | null>(null);
  let loading = $state(true);

  async function load(brand: number, property: string, signal: AbortSignal) {
    try {
      const res = await fetch(
        `/api/google-analytics/realtime?brand=${brand}&property=${encodeURIComponent(property)}`,
        { signal, headers: { accept: "application/json" } },
      );
      const body = (await res.json().catch(() => null)) as
        | GoogleAnalyticsRealtime
        | { error?: string; message?: string }
        | null;

      if (signal.aborted) return;

      if (!res.ok || !body || !("perMinute" in body)) {
        const message =
          body && "error" in body && typeof body.error === "string"
            ? body.error
            : body && "message" in body && typeof body.message === "string"
              ? body.message
              : `Live data unavailable (${res.status})`;
        loadError = message;
      } else {
        realtime = body;
        loadError = null;
      }
    } catch (err) {
      if (signal.aborted) return;
      loadError = err instanceof Error ? err.message : String(err);
    } finally {
      if (!signal.aborted) loading = false;
    }
  }

  // Re-arm whenever the property changes; poll only while the tab is visible.
  $effect(() => {
    const brand = brandId;
    const property = propertyRowId;
    const controller = new AbortController();

    realtime = null;
    loadError = null;
    loading = true;

    void load(brand, property, controller.signal);

    const tick = () => {
      if (document.visibilityState === "visible") {
        void load(brand, property, controller.signal);
      }
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  });

  const chartData = $derived(
    (realtime?.perMinute ?? [])
      .map((point) => ({
        minute: -point.minutesAgo,
        activeUsers: point.activeUsers,
      }))
      .sort((left, right) => left.minute - right.minute),
  );

  const chartConfig = {
    activeUsers: { label: "Active users", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  const updatedAt = $derived(
    realtime
      ? new Date(realtime.fetchedAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null,
  );

  const formatMinute = (value: number) =>
    value === 0 ? "now" : `${Math.abs(value)} min ago`;
</script>

<Card.Root aria-busy={loading}>
  <Card.Header class="pb-2">
    <div class="flex items-center justify-between gap-2">
      <Card.Description class="flex items-center gap-2">
        <span class="relative flex size-2" aria-hidden="true">
          <span
            class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60"
          ></span>
          <span class="relative inline-flex size-2 rounded-full bg-emerald-500"
          ></span>
        </span>
        Live now · last 30 minutes
      </Card.Description>
      {#if updatedAt}
        <span class="text-muted-foreground text-xs tabular-nums"
          >updated {updatedAt}</span
        >
      {/if}
    </div>
    {#if loading && !realtime}
      <Skeleton class="mt-1 h-9 w-24" />
    {:else if realtime}
      <Card.Title class="text-4xl tabular-nums">
        {formatInteger(realtime.activeUsers)}
        <span class="text-muted-foreground text-base font-normal"
          >active users</span
        >
      </Card.Title>
    {/if}
  </Card.Header>
  <Card.Content class="space-y-3">
    {#if loadError}
      <p class="text-destructive text-sm">{loadError}</p>
    {:else if loading && !realtime}
      <Skeleton class="h-20 w-full rounded-xl" />
      <div class="space-y-2">
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
      </div>
    {:else if realtime}
      <Chart.Container config={chartConfig} class="h-20 w-full">
        <AreaChart
          data={chartData}
          x="minute"
          yPadding={[0, 8]}
          series={[
            {
              key: "activeUsers",
              label: "Active users",
              color: "var(--color-activeUsers)",
            },
          ]}
          props={{
            xAxis: {
              format: (v: number) => (v === 0 ? "now" : `${Math.abs(v)}m`),
              ticks: 4,
            },
            yAxis: { format: (v: number) => `${v}`, ticks: 2 },
          }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip
              indicator="dot"
              labelFormatter={(v: number) => formatMinute(v)}
            />
          {/snippet}
          {#snippet marks({ context })}
            {#each context.series.visibleSeries as s (s.key)}
              <LinearGradient
                stops={[
                  s.color ?? "",
                  "color-mix(in lch, " + s.color + " 10%, transparent)",
                ]}
                vertical
              >
                {#snippet children({ gradient })}
                  <Area
                    seriesKey={s.key}
                    fillOpacity={0.3}
                    line={{ class: "stroke-1" }}
                    motion="tween"
                    {...s.props}
                    fill={gradient}
                  />
                {/snippet}
              </LinearGradient>
            {/each}
          {/snippet}
        </AreaChart>
      </Chart.Container>

      {#if realtime.topPages.length > 0}
        <ul class="space-y-1 text-sm">
          {#each realtime.topPages as pageRow, position (position)}
            <li class="flex items-baseline justify-between gap-3">
              <span class="truncate" title={pageRow.title}>{pageRow.title}</span
              >
              <span class="text-muted-foreground shrink-0 tabular-nums"
                >{formatInteger(pageRow.activeUsers)}</span
              >
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-muted-foreground text-sm">
          Nobody is on {propertyName} right now.
        </p>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
