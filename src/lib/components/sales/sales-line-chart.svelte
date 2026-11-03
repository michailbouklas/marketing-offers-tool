<script lang="ts">
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { scaleUtc } from "d3-scale";
  import { LineChart, Spline } from "layerchart";

  export type SalesLinePoint = { date: Date } & Record<string, number | Date>;

  let {
    data,
    series,
    format,
    compact = false,
    class: className = "h-72 w-full",
  }: {
    data: SalesLinePoint[];
    /** Plotted keys in colour order; keys feed `var(--color-<key>)`, keep them CSS-safe. */
    series: { key: string; label: string }[];
    format: (value: number) => string;
    /** Sparkline: no axes, grid or legend. */
    compact?: boolean;
    class?: string;
  } = $props();

  const chartConfig = $derived(
    Object.fromEntries(
      series.map((item, index) => [
        item.key,
        { label: item.label, color: reasonColor(index) },
      ]),
    ) satisfies Chart.ChartConfig,
  );

  const MAX_AXIS_TICKS = 8;
  const axisTicks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(data.length / MAX_AXIS_TICKS));
    return data.filter((_, index) => index % step === 0).map((p) => p.date);
  });

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const formatTooltip = (v: Date) =>
    v.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
</script>

{#if data.length < 2}
  <p class="text-muted-foreground text-sm">
    Pick a range of at least two days to see a trend.
  </p>
{:else}
  <Chart.Container config={chartConfig} class={className}>
    <LineChart
      {data}
      x="date"
      xScale={scaleUtc()}
      yPadding={[0, compact ? 4 : 16]}
      axis={!compact}
      grid={!compact}
      series={series.map((item) => ({
        key: item.key,
        label: item.label,
        color: `var(--color-${item.key})`,
      }))}
      legend={!compact && series.length > 1}
      props={{
        xAxis: { format: formatAxis, ticks: axisTicks },
        yAxis: { format },
      }}
    >
      {#snippet marks({ context })}
        {#each context.series.visibleSeries as s (s.key)}
          <Spline seriesKey={s.key} class="stroke-2" stroke={s.color} />
        {/each}
      {/snippet}
      {#snippet tooltip()}
        <Chart.Tooltip indicator="dot" labelFormatter={formatTooltip}>
          {#snippet formatter({ value, name, item })}
            <div
              style="--color-bg: {item.color}"
              class="size-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
            ></div>
            <div
              class="flex flex-1 items-center justify-between gap-4 leading-none"
            >
              <span class="text-muted-foreground">{name}</span>
              <span class="text-foreground font-mono font-medium tabular-nums">
                {format(Number(value))}
              </span>
            </div>
          {/snippet}
        </Chart.Tooltip>
      {/snippet}
    </LineChart>
  </Chart.Container>
{/if}
