<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { SectionHealthTrend } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { scaleUtc } from "d3-scale";
  import { curveNatural } from "d3-shape";
  import { LineChart, Spline } from "layerchart";

  type ChartPoint = { date: Date } & Record<string, number | null | Date>;

  let {
    trend,
    title = "Section problem rate",
    description = "Share of stores where each section was partial or failed, per run. Skipped stores (failed store switch) are excluded; the line breaks over sessions with no diagnostics.",
  }: {
    trend: SectionHealthTrend;
    title?: string;
    description?: string;
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

  // Keep nulls as null (never coerce to 0) so the line breaks on missing data.
  const chartData = $derived(
    trend.points.map((point) => {
      const datum: ChartPoint = { date: new Date(point.scrapedAt) };
      for (const item of trend.series) {
        datum[item.key] = point.values[item.key] ?? null;
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
        Not enough diagnostics history to chart yet.
      </p>
    {:else}
      <Chart.Container config={chartConfig} class="h-64 w-full">
        <LineChart
          data={chartData}
          x="date"
          xScale={scaleUtc()}
          yDomain={[0, null]}
          yPadding={[0, 16]}
          series={chartSeries}
          legend
          props={{
            xAxis: { format: formatAxis },
            yAxis: { format: (v: number) => `${v}%` },
          }}
        >
          {#snippet marks({ context })}
            {#each context.series.visibleSeries as s (s.key)}
              <Spline
                seriesKey={s.key}
                curve={curveNatural}
                class="stroke-2"
                stroke={s.color}
                defined={(d: ChartPoint) => d[s.key] !== null}
              />
            {/each}
          {/snippet}
          {#snippet tooltip()}
            <Chart.Tooltip indicator="dot" labelFormatter={formatTooltip} />
          {/snippet}
        </LineChart>
      </Chart.Container>
    {/if}
  </Card.Content>
</Card.Root>
