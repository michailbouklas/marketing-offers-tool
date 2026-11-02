<script lang="ts">
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import {
    formatSalesAmount,
    formatSalesCount,
    type SalesDashboardBrand,
    type SalesDayRow,
  } from "$lib/services/sales-dashboard";
  import { scaleUtc } from "d3-scale";
  import { LineChart, Spline } from "layerchart";

  type ChartPoint = { date: Date } & Record<string, number | Date>;

  let { days, brands }: { days: SalesDayRow[]; brands: SalesDashboardBrand[] } =
    $props();

  // Index-based keys: they feed `var(--color-<key>)`, so they must be CSS-safe
  // whatever the brand alias looks like.
  const series = $derived(
    brands.map((brand, index) => ({
      key: `b${index}`,
      alias: brand.alias,
      label: brand.name,
      color: reasonColor(index),
    })),
  );

  const chartConfig = $derived(
    Object.fromEntries(
      series.map((item) => [
        item.key,
        { label: item.label, color: item.color },
      ]),
    ) satisfies Chart.ChartConfig,
  );

  // Transactions ride along under `<key>_txns` so the tooltip can read them
  // off the hovered datum; only `<key>` is plotted.
  const chartData = $derived(
    days.map((day) => {
      const datum: ChartPoint = { date: new Date(`${day.day}T00:00:00Z`) };
      for (const item of series) {
        const totals = day.byBrand[item.alias];
        datum[item.key] = totals?.net ?? 0;
        datum[`${item.key}_txns`] = totals?.txns ?? 0;
      }
      return datum;
    }),
  );

  const MAX_AXIS_TICKS = 8;
  const axisTicks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(chartData.length / MAX_AXIS_TICKS));
    return chartData
      .filter((_, index) => index % step === 0)
      .map((point) => point.date);
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

{#if chartData.length < 2}
  <p class="text-muted-foreground text-sm">
    Pick a range of at least two days to chart sales over time.
  </p>
{:else}
  <Chart.Container config={chartConfig} class="h-96 w-full">
    <LineChart
      data={chartData}
      x="date"
      xScale={scaleUtc()}
      yPadding={[0, 16]}
      series={series.map((item) => ({
        key: item.key,
        label: item.label,
        color: `var(--color-${item.key})`,
      }))}
      legend={series.length > 1}
      props={{
        xAxis: { format: formatAxis, ticks: axisTicks },
        yAxis: { format: (v: number) => formatCompactMoney(v) },
      }}
    >
      {#snippet marks({ context })}
        {#each context.series.visibleSeries as s (s.key)}
          <Spline seriesKey={s.key} class="stroke-2" stroke={s.color} />
        {/each}
      {/snippet}
      {#snippet tooltip({ context })}
        <Chart.Tooltip indicator="dot" labelFormatter={formatTooltip}>
          {#snippet formatter({ value, name, item })}
            {@const hovered = context.tooltip.data as ChartPoint | null}
            {@const txns = Number(hovered?.[`${item.key}_txns`] ?? 0)}
            <div
              style="--color-bg: {item.color}"
              class="size-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
            ></div>
            <div
              class="flex flex-1 items-center justify-between gap-4 leading-none"
            >
              <span class="text-muted-foreground">{name}</span>
              <span class="text-foreground font-mono font-medium tabular-nums">
                {formatSalesCount(txns)} txns · {formatSalesAmount(
                  Number(value),
                )}
              </span>
            </div>
          {/snippet}
        </Chart.Tooltip>
      {/snippet}
    </LineChart>
  </Chart.Container>
{/if}
