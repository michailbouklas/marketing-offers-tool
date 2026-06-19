<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { fetchActiveOffersByDayByAggregator } from "$lib/services/competition/active-offers-by-day";
  import type {
    ActiveOffersByAggregatorSeries,
    ActiveOffersByAggregatorTimeSeries,
  } from "$lib/services/competition/competition";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { scaleUtc } from "d3-scale";
  import { curveNatural } from "d3-shape";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  type ChartPoint = Record<string, Date | number>;

  let {
    title = "Active offers by day by aggregator",
    description = "Daily active offer counts split by aggregator for the last 45 days.",
  }: {
    title?: string;
    description?: string;
    settings?: Record<string, unknown>;
  } = $props();

  const PALETTE = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  let status = $state<"loading" | "ready" | "error">("loading");
  let series = $state<ActiveOffersByAggregatorSeries[]>([]);
  let chartData = $state<ChartPoint[]>([]);
  let totalOffers = $state(0);

  const chartConfig = $derived(
    Object.fromEntries(
      series.map((item, index) => [
        item.key,
        { label: item.label, color: PALETTE[index % PALETTE.length] },
      ]),
    ) satisfies Chart.ChartConfig,
  );

  const chartSeries = $derived(
    series.map((item) => ({
      key: item.key,
      label: item.label,
      color: `var(--color-${item.key})`,
    })),
  );

  function toChartData(payload: ActiveOffersByAggregatorTimeSeries) {
    return payload.points.map((point) => {
      const datum: ChartPoint = {
        date: new Date(`${point.date}T00:00:00.000Z`),
      };

      for (const [key, count] of Object.entries(point.counts)) {
        datum[key] = count;
      }

      return datum;
    });
  }

  function countLatestActiveOffers(
    payload: ActiveOffersByAggregatorTimeSeries,
  ) {
    const latestPoint = payload.points.at(-1);

    if (!latestPoint) {
      return 0;
    }

    return Object.values(latestPoint.counts).reduce(
      (sum, count) => sum + count,
      0,
    );
  }

  $effect(() => {
    let cancelled = false;
    status = "loading";

    (async () => {
      try {
        const payload = await fetchActiveOffersByDayByAggregator();

        if (cancelled) {
          return;
        }

        series = payload.series;
        chartData = toChartData(payload);
        totalOffers = countLatestActiveOffers(payload);
        status = "ready";
      } catch {
        if (!cancelled) {
          status = "error";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      {#if status === "ready" && chartData.length > 0 && series.length > 0}
        {totalOffers} active offer{totalOffers === 1 ? "" : "s"} on the latest day
        across {series.length} aggregator{series.length === 1 ? "" : "s"}.
      {:else}
        {description}
      {/if}
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if status === "loading"}
      <div
        class="text-muted-foreground flex h-72 w-full flex-col items-center justify-center gap-3"
      >
        <LoaderCircleIcon class="size-6 animate-spin" />
        <p class="text-sm">Loading active offer history…</p>
      </div>
    {:else if status === "error"}
      <div
        class="text-muted-foreground flex h-72 w-full items-center justify-center text-sm"
      >
        Could not load active offer history. Please try again later.
      </div>
    {:else if chartData.length === 0 || series.length === 0}
      <div
        class="text-muted-foreground flex h-72 w-full items-center justify-center text-sm"
      >
        No active offer history to display yet.
      </div>
    {:else}
      <Chart.Container config={chartConfig} class="h-72 w-full">
        <AreaChart
          data={chartData}
          x="date"
          xScale={scaleUtc()}
          yPadding={[0, 25]}
          series={chartSeries}
          seriesLayout="stack"
          legend
          props={{
            xAxis: {
              format: (v: Date) =>
                v.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                }),
            },
            yAxis: { format: (v: number) => `${v}` },
          }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip
              indicator="dot"
              labelFormatter={(v: Date) =>
                v.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
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
                    curve={curveNatural}
                    fillOpacity={0.4}
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
    {/if}
  </Card.Content>
</Card.Root>
