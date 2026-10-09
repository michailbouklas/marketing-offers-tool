<script lang="ts">
  import ForecastTooltipRow from "$lib/components/forecasts/widgets/forecast-tooltip-row.svelte";
  import ModelSwatch from "$lib/components/forecasts/widgets/model-swatch.svelte";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import {
    axisTicks,
    formatAxisDay,
    formatTooltipDay,
    Y_HEADROOM,
  } from "$lib/services/forecasts/forecast-chart-data";
  import {
    formatCompactMoney,
    formatCompactMoneyRange,
    formatSignedPct,
    isoDateToUtc,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ModelStroke } from "$lib/services/forecasts/forecast-types";
  import type { ForecastValidationRunPoint } from "$lib/services/forecasts/forecast-validation";
  import { scaleUtc } from "d3-scale";
  import { Area, LineChart, Pattern, Spline, Tooltip } from "layerchart";

  /**
   * Daily forecast (line + hatched 80 % band) against what actually sold,
   * for one validation run. Adapted from `forecast-chart.svelte`; there is no
   * history or cutoff here, the window is the whole x axis.
   */
  let {
    points,
    modelName,
    stroke,
    class: className = "h-72",
  }: {
    points: ForecastValidationRunPoint[];
    modelName: string;
    stroke: ModelStroke;
    class?: string;
  } = $props();

  type Row = {
    date: Date;
    ds: string;
    forecast: number;
    lo80: number;
    hi80: number;
    actual: number | null;
  };

  const ACTUAL_COLOR = "var(--chart-1)";
  const ACTUAL_STROKE: ModelStroke = { color: ACTUAL_COLOR, dash: "" };

  const patternId = $props.id();

  const rows = $derived<Row[]>(
    points.map((point) => ({
      date: isoDateToUtc(point.ds),
      ds: point.ds,
      forecast: point.yhat,
      lo80: point.lo80,
      hi80: point.hi80,
      actual: point.actual,
    })),
  );
  const ticks = $derived(axisTicks(rows));
  const yDomain = $derived<[number, number]>([
    0,
    Math.max(1, ...rows.map((row) => Math.max(row.hi80, row.actual ?? 0))) *
      Y_HEADROOM,
  ]);

  const chartConfig = $derived({
    actual: { label: "Actual sales", color: ACTUAL_COLOR },
    forecast: { label: modelName, color: stroke.color },
  } satisfies Chart.ChartConfig);

  const series = $derived([
    {
      key: "actual",
      label: "Actual sales",
      value: (d: Row) => d.actual,
      color: ACTUAL_COLOR,
      props: {
        class: "stroke-[1.5]",
        opacity: 0.8,
        defined: (d: Row) => d.actual !== null,
      },
    },
    {
      key: "forecast",
      label: modelName,
      value: (d: Row) => d.forecast,
      color: stroke.color,
      props: {
        class: "stroke-2",
        "stroke-dasharray": stroke.dash || undefined,
      },
    },
  ]);

  const formatY = (value: number) => formatCompactMoney(value);

  function errorPct(row: Row): number | null {
    if (row.actual === null || row.actual === 0) {
      return null;
    }
    return ((row.forecast - row.actual) / row.actual) * 100;
  }
</script>

<div class="space-y-2">
  <Chart.Container
    config={chartConfig}
    class="w-full {className}"
    role="img"
    aria-label="Chart of actual daily sales against the {modelName} forecast and its likely range."
  >
    <LineChart
      data={rows}
      x="date"
      xScale={scaleUtc()}
      {yDomain}
      {series}
      props={{
        xAxis: { format: formatAxisDay, ticks },
        yAxis: { format: formatY },
        highlight: { points: { r: 3 } },
      }}
    >
      {#snippet marks({ context })}
        <Pattern
          id="validation-band-{patternId}"
          size={6}
          lines={{
            rotate: -45,
            width: "1",
            color: stroke.color,
            opacity: 0.55,
          }}
        >
          {#snippet children({ pattern })}
            <Area
              data={rows}
              y0={(d: Row) => d.lo80}
              y1={(d: Row) => d.hi80}
              fill={pattern}
              fillOpacity={0.9}
            />
          {/snippet}
        </Pattern>
        {#each context.series.visibleSeries as s (s.key)}
          <Spline seriesKey={s.key} {...s.props} />
        {/each}
      {/snippet}

      {#snippet tooltip()}
        <Tooltip.Root variant="none">
          {#snippet children({ data })}
            {@const row = data as Row}
            <div
              class="border-border/50 bg-background grid min-w-[12rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
            >
              <div class="font-medium">{formatTooltipDay(row.date)}</div>
              {#if row.actual !== null}
                <ForecastTooltipRow
                  label="Actual"
                  value={formatCompactMoney(row.actual)}
                  stroke={ACTUAL_STROKE}
                />
              {/if}
              <ForecastTooltipRow
                label="Forecast"
                value={formatCompactMoney(row.forecast)}
                detail="likely {formatCompactMoneyRange(row.lo80, row.hi80)}"
                {stroke}
              />
              {#if errorPct(row) !== null}
                <ForecastTooltipRow
                  label="Forecast vs actual"
                  value={formatSignedPct(errorPct(row))}
                />
              {/if}
            </div>
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </LineChart>
  </Chart.Container>

  <ul
    class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
    aria-hidden="true"
  >
    <li class="flex items-center gap-1.5">
      <ModelSwatch stroke={ACTUAL_STROKE} class="h-2 w-5" />
      Actual sales
    </li>
    <li class="flex items-center gap-1.5">
      <ModelSwatch {stroke} class="h-2 w-5" />
      {modelName} forecast
    </li>
    <li class="flex items-center gap-1.5">
      <span
        class="inline-block h-2.5 w-5 rounded-[2px] opacity-60"
        style="background: repeating-linear-gradient(-45deg, {stroke.color} 0 1px, transparent 1px 4px);"
      ></span>
      Likely range (80 %)
    </li>
  </ul>
</div>
