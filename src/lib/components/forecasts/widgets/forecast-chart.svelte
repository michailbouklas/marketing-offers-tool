<script lang="ts">
  import * as Chart from "$lib/components/ui/chart/index.js";
  import {
    axisTicks,
    buildChartRows,
    cutoffAsDate,
    formatAxisDay,
    formatTooltipDay,
    yMax,
    type ChartRow,
  } from "$lib/services/forecasts/forecast-chart-data";
  import {
    formatCompactMoney,
    formatCompactMoneyRange,
    headlineSentence,
  } from "$lib/services/forecasts/forecast-narrative";
  import type {
    ForecastResult,
    ModelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import { scaleUtc } from "d3-scale";
  import {
    AnnotationLine,
    Area,
    LineChart,
    Pattern,
    Spline,
    Tooltip,
  } from "layerchart";
  import { prefersReducedMotion } from "svelte/motion";
  import ForecastTooltipRow from "./forecast-tooltip-row.svelte";
  import ModelSwatch from "./model-swatch.svelte";

  let {
    result,
    stroke,
    showWideBand = false,
    contextDays,
    cutoffLabel = "Today",
    class: className = "h-64",
  }: {
    result: ForecastResult;
    stroke: ModelStroke;
    /** Also draw the wider 95 % band (deep-dive view). */
    showWideBand?: boolean;
    /** Actual days shown before the cutoff; defaults to max(28, 2 × horizon). */
    contextDays?: number;
    cutoffLabel?: string;
    class?: string;
  } = $props();

  const ACTUAL_COLOR = "var(--chart-1)";
  const ACTUAL_STROKE: ModelStroke = { color: ACTUAL_COLOR, dash: "" };

  const patternId = $props.id();

  const rows = $derived(buildChartRows(result, { contextDays }));
  const ticks = $derived(axisTicks(rows));
  const yDomain = $derived<[number, number]>([
    0,
    yMax(rows, { wide: showWideBand }),
  ]);
  const cutoff = $derived(cutoffAsDate(result));
  const motion = $derived<"tween" | "none">(
    prefersReducedMotion.current ? "none" : "tween",
  );

  const chartConfig = $derived({
    actual: { label: "Actual sales", color: ACTUAL_COLOR },
    forecast: { label: result.modelName, color: stroke.color },
  } satisfies Chart.ChartConfig);

  const series = $derived([
    {
      key: "actual",
      label: "Actual sales",
      value: (d: ChartRow) => d.actual,
      color: ACTUAL_COLOR,
      props: {
        class: "stroke-[1.5]",
        opacity: 0.7,
        defined: (d: ChartRow) => d.actual !== null,
        motion,
      },
    },
    {
      key: "forecast",
      label: result.modelName,
      value: (d: ChartRow) => d.forecast,
      color: stroke.color,
      props: {
        class: "stroke-2",
        "stroke-dasharray": stroke.dash || undefined,
        defined: (d: ChartRow) => d.forecast !== null,
        motion,
      },
    },
  ]);

  const ariaLabel = $derived(
    `Chart of actual sales and the ${result.modelName} forecast. ${headlineSentence(result)}`,
  );

  const formatY = (value: number) => formatCompactMoney(value);
</script>

<div class="space-y-2">
  <Chart.Container
    config={chartConfig}
    class="w-full {className}"
    role="img"
    aria-label={ariaLabel}
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
          id="forecast-band-{patternId}"
          size={6}
          lines={{
            rotate: -45,
            width: "1",
            color: stroke.color,
            opacity: 0.55,
          }}
        >
          {#snippet children({ pattern })}
            {#if showWideBand}
              <Area
                data={rows}
                y0={(d: ChartRow) => d.lo95}
                y1={(d: ChartRow) => d.hi95}
                defined={(d: ChartRow) => d.lo95 !== null}
                fill={stroke.color}
                fillOpacity={0.08}
                {motion}
              />
            {/if}
            <Area
              data={rows}
              y0={(d: ChartRow) => d.lo80}
              y1={(d: ChartRow) => d.hi80}
              defined={(d: ChartRow) => d.lo80 !== null}
              fill={pattern}
              fillOpacity={0.9}
              {motion}
            />
          {/snippet}
        </Pattern>
        {#each context.series.visibleSeries as s (s.key)}
          <Spline seriesKey={s.key} {...s.props} />
        {/each}
      {/snippet}

      {#snippet aboveMarks()}
        <AnnotationLine
          x={cutoff}
          label={cutoffLabel}
          labelPlacement="top-right"
          labelXOffset={4}
          props={{
            line: {
              class: "stroke-muted-foreground/60 [stroke-dasharray:3_3]",
            },
            label: { class: "fill-muted-foreground text-[10px]" },
          }}
        />
      {/snippet}

      {#snippet tooltip()}
        <Tooltip.Root variant="none">
          {#snippet children({ data })}
            {@const row = data as ChartRow}
            <div
              class="border-border/50 bg-background grid min-w-[11rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
            >
              <div class="font-medium">{formatTooltipDay(row.date)}</div>
              {#if row.actual !== null}
                <ForecastTooltipRow
                  label="Actual"
                  value={formatCompactMoney(row.actual)}
                  stroke={ACTUAL_STROKE}
                />
              {/if}
              {#if row.forecast !== null && !row.seam}
                <ForecastTooltipRow
                  label="Forecast"
                  value={formatCompactMoney(row.forecast)}
                  detail={row.lo80 !== null && row.hi80 !== null
                    ? `likely ${formatCompactMoneyRange(row.lo80, row.hi80)}`
                    : null}
                  {stroke}
                />
                {#if showWideBand && row.lo95 !== null && row.hi95 !== null}
                  <ForecastTooltipRow
                    label="Wider range (95 %)"
                    value={formatCompactMoneyRange(row.lo95, row.hi95)}
                  />
                {/if}
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
      {result.modelName} forecast
    </li>
    <li class="flex items-center gap-1.5">
      <span
        class="inline-block h-2.5 w-5 rounded-[2px] opacity-60"
        style="background: repeating-linear-gradient(-45deg, {stroke.color} 0 1px, transparent 1px 4px);"
      ></span>
      Likely range (80 %)
    </li>
    {#if showWideBand}
      <li class="flex items-center gap-1.5">
        <span
          class="inline-block h-2.5 w-5 rounded-[2px] opacity-30"
          style="background: {stroke.color};"
        ></span>
        Wider range (95 %)
      </li>
    {/if}
  </ul>
</div>
