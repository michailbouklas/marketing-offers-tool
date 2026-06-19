<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { SentimentTimeseriesPoint } from "$lib/services/google-reviews/google-reviews";
  import { scaleUtc } from "d3-scale";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  let {
    title = "Sentiment over time",
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: SentimentTimeseriesPoint[];
  } = $props();

  const chartData = $derived(
    data.map((point) => ({
      date: new Date(`${point.day}T00:00:00Z`),
      positive: point.positive,
      neutral: point.neutral,
      negative: point.negative,
    })),
  );

  const chartConfig = {
    positive: { label: "Positive", color: "var(--color-emerald-600)" },
    neutral: { label: "Neutral", color: "var(--color-zinc-400)" },
    negative: { label: "Negative", color: "var(--color-red-600)" },
  } satisfies Chart.ChartConfig;

  const chartSeries = [
    { key: "positive", label: "Positive", color: "var(--color-positive)" },
    { key: "neutral", label: "Neutral", color: "var(--color-neutral)" },
    { key: "negative", label: "Negative", color: "var(--color-negative)" },
  ];

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  const formatTooltip = (v: Date) =>
    v.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Reviews per month by sentiment across this business's history.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if chartData.length < 2}
      <p class="text-muted-foreground text-sm">
        Not enough review history to chart yet.
      </p>
    {:else}
      <Chart.Container config={chartConfig} class="h-72 w-full">
        <AreaChart
          data={chartData}
          x="date"
          xScale={scaleUtc()}
          yPadding={[0, 16]}
          series={chartSeries}
          seriesLayout="stack"
          legend
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
