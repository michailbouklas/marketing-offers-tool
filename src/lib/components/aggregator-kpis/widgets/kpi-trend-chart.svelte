<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { TimeseriesPoint } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import { scaleUtc } from "d3-scale";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  let {
    title,
    description,
    label = "Value",
    unit = "",
    decimals = 1,
    data,
  }: {
    title: string;
    description: string;
    /** Series label shown in the tooltip. */
    label?: string;
    /** Suffix appended to axis/values, e.g. "%". */
    unit?: string;
    decimals?: number;
    data: TimeseriesPoint[];
  } = $props();

  const chartData = $derived(
    data.map((point) => ({
      date: new Date(`${point.day}T00:00:00Z`),
      value: point.value,
    })),
  );

  const chartConfig = $derived({
    value: { label, color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig);

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const formatTooltip = (v: Date) =>
    v.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const formatValue = (v: number) => `${v.toFixed(decimals)}${unit}`;
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
        Not enough history to chart yet.
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
              label,
              color: "var(--color-value)",
            },
          ]}
          props={{
            xAxis: { format: formatAxis },
            yAxis: { format: formatValue },
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
