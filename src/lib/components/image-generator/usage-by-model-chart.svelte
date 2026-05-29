<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type {
    ModelUsageOverTime,
    ModelUsageSeries,
  } from "$lib/services/image-generator/image-generator.server";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { scaleUtc } from "d3-scale";
  import { curveNatural } from "d3-shape";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  type ChartPoint = Record<string, number | Date>;

  let {
    endpoint,
    title = "Generations per model over time",
    description = "Images generated per model, by day.",
  }: {
    endpoint: string;
    title?: string;
    description?: string;
  } = $props();

  // Cycled across series; mirrors shadcn-svelte's default chart palette.
  const PALETTE = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  let status = $state<"loading" | "ready" | "error">("loading");
  let series = $state<ModelUsageSeries[]>([]);
  let chartData = $state<ChartPoint[]>([]);
  let total = $state(0);

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

  $effect(() => {
    const target = endpoint;
    let cancelled = false;
    status = "loading";

    (async () => {
      try {
        const response = await fetch(target);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = (await response.json()) as ModelUsageOverTime;
        if (cancelled) {
          return;
        }
        series = payload.series;
        chartData = payload.points.map((point) => {
          const datum: ChartPoint = {
            date: new Date(`${point.date}T00:00:00.000Z`),
          };
          for (const [key, count] of Object.entries(point.counts)) {
            datum[key] = count;
          }
          return datum;
        });
        total = payload.points.reduce(
          (sum, point) =>
            sum +
            Object.values(point.counts).reduce((rowSum, n) => rowSum + n, 0),
          0,
        );
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
      {#if status === "ready" && chartData.length > 0}
        {total} image{total === 1 ? "" : "s"} across {series.length} model{series.length ===
        1
          ? ""
          : "s"}
      {:else}
        {description}
      {/if}
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if status === "loading"}
      <div
        class="text-muted-foreground flex aspect-video w-full flex-col items-center justify-center gap-3"
      >
        <LoaderCircleIcon class="size-6 animate-spin" />
        <p class="text-sm">Loading model usage…</p>
      </div>
    {:else if status === "error"}
      <div
        class="text-muted-foreground flex aspect-video w-full items-center justify-center text-sm"
      >
        Could not load model usage. Please try again later.
      </div>
    {:else if chartData.length === 0 || series.length === 0}
      <div
        class="text-muted-foreground flex aspect-video w-full items-center justify-center text-sm"
      >
        No model usage to display yet.
      </div>
    {:else}
      <Chart.Container config={chartConfig} class="w-full">
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
