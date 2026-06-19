<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { TimeseriesPoint } from "$lib/services/google-reviews/google-reviews";
  import { scaleUtc } from "d3-scale";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  let {
    title = "Reviews per day",
    description = "New Google reviews captured per day over the last six months.",
    dateFormat = "day",
    data,
  }: {
    title?: string;
    description?: string;
    /** Granularity of the buckets in `data`; controls axis/tooltip labels. */
    dateFormat?: "day" | "month";
    settings?: Record<string, unknown>;
    data: TimeseriesPoint[];
  } = $props();

  const chartData = $derived(
    data.map((point) => ({
      date: new Date(`${point.day}T00:00:00Z`),
      value: point.value,
    })),
  );

  const chartConfig = {
    value: { label: "Reviews", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  const formatAxis = (v: Date) =>
    dateFormat === "month"
      ? v.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : v.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const formatTooltip = (v: Date) =>
    dateFormat === "month"
      ? v.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : v.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      {description}
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if chartData.length < 2}
      <p class="text-muted-foreground text-sm">
        Not enough review history to chart yet.
      </p>
    {:else}
      <Chart.Container config={chartConfig} class="h-56 w-full">
        <AreaChart
          data={chartData}
          x="date"
          xScale={scaleUtc()}
          yPadding={[0, 16]}
          series={[
            {
              key: "value",
              label: "Reviews",
              color: "var(--color-value)",
            },
          ]}
          props={{
            xAxis: { format: formatAxis },
            yAxis: { format: (v: number) => `${v}` },
          }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip indicator="dot" labelFormatter={formatTooltip} />
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
