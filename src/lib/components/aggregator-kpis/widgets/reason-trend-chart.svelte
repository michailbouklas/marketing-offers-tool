<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { ReasonTrend } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { scaleUtc } from "d3-scale";
  import { curveNatural } from "d3-shape";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  type ChartPoint = Record<string, number | Date>;

  let {
    trend,
    title,
    description,
  }: {
    trend: ReasonTrend;
    title: string;
    description: string;
  } = $props();

  const chartConfig = $derived(
    Object.fromEntries(
      trend.series.map((item, index) => [
        item.key,
        { label: item.label, color: reasonColor(index) },
      ]),
    ) satisfies Chart.ChartConfig,
  );

  const chartSeries = $derived(
    trend.series.map((item) => ({
      key: item.key,
      label: item.label,
      color: `var(--color-${item.key})`,
    })),
  );

  // Every series key present at every point (absent reason = 0), as the stack
  // layout requires a numeric value per series.
  const chartData = $derived(
    trend.points.map((point) => {
      const datum: ChartPoint = {
        date: new Date(point.scrapedAt),
      };
      for (const item of trend.series) {
        datum[item.key] = point.values[item.key] ?? 0;
      }
      return datum;
    }),
  );

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const formatTooltip = (v: Date) =>
    v.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if chartData.length < 2 || chartSeries.length === 0}
      <p class="text-muted-foreground text-sm">
        Not enough reason history to chart yet.
      </p>
    {:else}
      <Chart.Container config={chartConfig} class="h-64 w-full">
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
