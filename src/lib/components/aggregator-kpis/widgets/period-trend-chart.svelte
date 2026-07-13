<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import {
    formatPeriodLong,
    formatPeriodShort,
    type PeriodKind,
    type PeriodPoint,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import { scaleUtc } from "d3-scale";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  let {
    title,
    description,
    label = "Value",
    unit = "",
    /** Prefix, e.g. "€" for money series. */
    prefix = "",
    decimals = 0,
    period,
    data,
  }: {
    title: string;
    description: string;
    /** Series label shown in the tooltip. */
    label?: string;
    /** Suffix appended to axis/values, e.g. "%". */
    unit?: string;
    prefix?: string;
    decimals?: number;
    period: PeriodKind;
    data: PeriodPoint[];
  } = $props();

  // Map each period to its start date (UTC) as the x value, keeping the raw
  // start/end strings for the period-aware axis and tooltip labels.
  const chartData = $derived(
    data.map((point) => ({
      date: new Date(`${point.periodStart}T00:00:00Z`),
      periodStart: point.periodStart,
      periodEnd: point.periodEnd,
      value: point.value,
    })),
  );

  const chartConfig = $derived({
    value: { label, color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig);

  // One tick per period, subsampled so long ranges don't crowd the axis.
  const MAX_AXIS_TICKS = 8;
  const axisTicks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(chartData.length / MAX_AXIS_TICKS));
    return chartData.filter((_, i) => i % step === 0).map((d) => d.date);
  });

  const byDate = $derived(new Map(chartData.map((d) => [d.date.getTime(), d])));

  const formatAxis = (v: Date) => {
    const point = byDate.get(v.getTime());
    return point
      ? formatPeriodShort(point.periodStart, period)
      : formatPeriodShort(v.toISOString().slice(0, 10), period);
  };

  const formatTooltip = (v: Date) => {
    const point = byDate.get(v.getTime());
    if (!point) {
      return formatPeriodShort(v.toISOString().slice(0, 10), period);
    }
    return formatPeriodLong(point.periodStart, point.periodEnd, period);
  };

  const formatValue = (v: number) => `${prefix}${v.toFixed(decimals)}${unit}`;
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
        Not enough completed periods to chart yet.
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
            xAxis: { format: formatAxis, ticks: axisTicks },
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
