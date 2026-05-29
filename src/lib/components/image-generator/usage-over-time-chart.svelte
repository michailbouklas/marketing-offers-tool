<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { GeneratedImageUsagePoint } from "$lib/services/image-generator/image-generator.server";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { scaleUtc } from "d3-scale";
  import { curveNatural } from "d3-shape";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  type UsageDatum = { date: Date; count: number };

  let {
    endpoint = "/api/images/usage",
    title = "Usage over time",
    description = "Images you generated, by day.",
  }: {
    endpoint?: string;
    title?: string;
    description?: string;
  } = $props();

  let status = $state<"loading" | "ready" | "error">("loading");
  let chartData = $state<UsageDatum[]>([]);

  const chartConfig = {
    count: { label: "Images generated", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  const total = $derived(
    chartData.reduce((sum, point) => sum + point.count, 0),
  );
  const rangeLabel = $derived.by(() => {
    if (chartData.length === 0) {
      return "";
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const first = formatter.format(chartData[0].date);
    const last = formatter.format(chartData[chartData.length - 1].date);
    return first === last ? first : `${first} – ${last}`;
  });

  // Re-fetch whenever the endpoint changes (e.g. the admin date-range filter
  // updates the query string) so the chart stays in sync with the page data.
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
        const payload = (await response.json()) as {
          points: GeneratedImageUsagePoint[];
        };
        if (cancelled) {
          return;
        }
        chartData = payload.points.map((point) => ({
          date: new Date(`${point.date}T00:00:00.000Z`),
          count: point.count,
        }));
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
        {total} image{total === 1 ? "" : "s"} generated · {rangeLabel}
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
        <p class="text-sm">Loading usage data…</p>
      </div>
    {:else if status === "error"}
      <div
        class="text-muted-foreground flex aspect-video w-full items-center justify-center text-sm"
      >
        Could not load usage data. Please try again later.
      </div>
    {:else if chartData.length === 0}
      <div
        class="text-muted-foreground flex aspect-video w-full items-center justify-center text-sm"
      >
        No usage data to display yet.
      </div>
    {:else}
      <Chart.Container config={chartConfig} class="w-full">
        <AreaChart
          data={chartData}
          x="date"
          xScale={scaleUtc()}
          yPadding={[0, 25]}
          series={[
            {
              key: "count",
              label: chartConfig.count.label,
              color: "var(--color-count)",
            },
          ]}
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
