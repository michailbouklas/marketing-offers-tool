<script lang="ts">
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    formatInvoiceAmount,
    type InvoiceTrend,
  } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { scaleUtc } from "d3-scale";
  import { LineChart, Spline } from "layerchart";

  type ChartPoint = { date: Date } & Record<string, number | Date>;

  let { trend }: { trend: InvoiceTrend } = $props();

  // "" = all transaction types on one graph.
  let selectedKey = $state("");

  // Colors are assigned by full-list index so a transaction type keeps its
  // color when the switcher narrows the view down to a single series.
  const chartConfig = $derived(
    Object.fromEntries(
      trend.series.map((item, index) => [
        item.key,
        { label: item.label, color: reasonColor(index) },
      ]),
    ) satisfies Chart.ChartConfig,
  );

  const visibleSeries = $derived(
    trend.series
      .filter((item) => selectedKey === "" || item.key === selectedKey)
      .map((item) => ({
        key: item.key,
        label: item.label,
        color: `var(--color-${item.key})`,
      })),
  );

  const chartData = $derived(
    trend.points.map((point) => {
      const datum: ChartPoint = { date: new Date(`${point.day}T00:00:00Z`) };
      for (const item of trend.series) {
        datum[item.key] = point.values[item.key] ?? 0;
      }
      return datum;
    }),
  );

  // One point per day; subsample the axis so long ranges don't crowd.
  const MAX_AXIS_TICKS = 8;
  const axisTicks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(chartData.length / MAX_AXIS_TICKS));
    return chartData
      .filter((_, index) => index % step === 0)
      .map((point) => point.date);
  });

  const compactAmountFormatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
  });

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const formatTooltip = (v: Date) =>
    v.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-muted-foreground text-sm">
      Daily invoice line totals per transaction type, across all invoices
      matching the current filters.
    </p>
    <NativeSelect.Root
      bind:value={selectedKey}
      aria-label="Transaction type"
      class="w-52"
    >
      <NativeSelect.Option value="">All transaction types</NativeSelect.Option>
      {#each trend.series as item (item.key)}
        <NativeSelect.Option value={item.key}>{item.label}</NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  {#if chartData.length < 2 || visibleSeries.length === 0}
    <p class="text-muted-foreground text-sm">
      Not enough invoice history to chart for the current filters.
    </p>
  {:else}
    <Chart.Container config={chartConfig} class="h-80 w-full">
      <LineChart
        data={chartData}
        x="date"
        xScale={scaleUtc()}
        yPadding={[0, 16]}
        series={visibleSeries}
        legend={visibleSeries.length > 1}
        props={{
          xAxis: { format: formatAxis, ticks: axisTicks },
          yAxis: { format: (v: number) => compactAmountFormatter.format(v) },
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
                class="flex flex-1 items-center justify-between leading-none"
              >
                <span class="text-muted-foreground">{name}</span>
                <span
                  class="text-foreground font-mono font-medium tabular-nums"
                >
                  {formatInvoiceAmount(
                    typeof value === "number" ? value : null,
                  )}
                </span>
              </div>
            {/snippet}
          </Chart.Tooltip>
        {/snippet}
      </LineChart>
    </Chart.Container>
  {/if}
</div>
