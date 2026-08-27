<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import {
    axisTicks,
    buildCompareBandRows,
    buildCompareRows,
    compareYMax,
    cutoffAsDate,
    formatAxisDay,
    formatTooltipDay,
    type CompareBandRow,
    type CompareRow,
  } from "$lib/services/forecasts/forecast-chart-data";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";
  import {
    modelColorIndex,
    modelStroke,
    type ForecastModel,
    type ForecastResult,
    type ModelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import { scaleUtc } from "d3-scale";
  import { AnnotationLine, Area, LineChart, Spline, Tooltip } from "layerchart";
  import { prefersReducedMotion } from "svelte/motion";
  import ForecastTooltipRow from "./forecast-tooltip-row.svelte";
  import ModelSwatch from "./model-swatch.svelte";

  let {
    results,
    catalog,
    contextDays,
    cutoffLabel = "Today",
  }: {
    /** Ready results only, in catalog order. */
    results: ForecastResult[];
    catalog: ForecastModel[];
    contextDays?: number;
    cutoffLabel?: string;
  } = $props();

  const ACTUAL_COLOR = "var(--chart-1)";
  const ACTUAL_STROKE: ModelStroke = { color: ACTUAL_COLOR, dash: "" };

  let showBands = $state(false);
  const switchId = $props.id();

  const rows = $derived(buildCompareRows(results, { contextDays }));
  const ticks = $derived(axisTicks(rows));
  const cutoff = $derived(results[0] ? cutoffAsDate(results[0]) : null);
  const motion = $derived<"tween" | "none">(
    prefersReducedMotion.current ? "none" : "tween",
  );

  const strokes = $derived(
    new Map(
      results.map((result) => [
        result.modelId,
        modelStroke(modelColorIndex(result.modelId, catalog)),
      ]),
    ),
  );

  function strokeFor(modelId: string): ModelStroke {
    return strokes.get(modelId) ?? modelStroke(0);
  }

  const bands = $derived(
    showBands
      ? results.map((result) => ({
          modelId: result.modelId,
          rows: buildCompareBandRows(result),
        }))
      : [],
  );

  const yDomain = $derived<[number, number]>([
    0,
    Math.max(
      compareYMax(rows),
      ...bands.flatMap((band) => band.rows.map((row) => row.hi * 1.05)),
    ),
  ]);

  const chartConfig = $derived(
    Object.fromEntries([
      ["actual", { label: "Actual sales", color: ACTUAL_COLOR }],
      ...results.map((result) => [
        result.modelId,
        { label: result.modelName, color: strokeFor(result.modelId).color },
      ]),
    ]) satisfies Chart.ChartConfig,
  );

  const series = $derived([
    {
      key: "actual",
      label: "Actual sales",
      value: (d: CompareRow) => d.actual,
      color: ACTUAL_COLOR,
      props: {
        class: "stroke-[1.5]",
        opacity: 0.7,
        defined: (d: CompareRow) => d.actual !== null,
        motion,
      },
    },
    ...results.map((result) => {
      const stroke = strokeFor(result.modelId);
      return {
        key: result.modelId,
        label: result.modelName,
        value: (d: CompareRow) => d.models[result.modelId] ?? null,
        color: stroke.color,
        props: {
          class: "stroke-2",
          "stroke-dasharray": stroke.dash || undefined,
          defined: (d: CompareRow) => d.models[result.modelId] != null,
          motion,
        },
      };
    }),
  ]);

  const ariaLabel = $derived(
    `Chart comparing ${results.map((result) => result.modelName).join(" and ")} forecasts against actual sales.`,
  );

  const formatY = (value: number) => formatCompactMoney(value);
</script>

<Card.Root>
  <Card.Header>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <Card.Title>Forecasts side by side</Card.Title>
        <Card.Description>
          Each model's expected daily sales, drawn over the recent actuals.
          Where the lines stay close, the models agree.
        </Card.Description>
      </div>
      <div class="flex items-center gap-2">
        <Switch id="compare-bands-{switchId}" bind:checked={showBands} />
        <Label for="compare-bands-{switchId}" class="text-sm font-normal">
          Show likely ranges
        </Label>
      </div>
    </div>
  </Card.Header>
  <Card.Content class="space-y-3">
    {#if results.length === 0}
      <p class="text-muted-foreground text-sm">
        Waiting for at least one forecast to finish.
      </p>
    {:else}
      <Chart.Container
        config={chartConfig}
        class="h-80 w-full"
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
            {#each bands as band (band.modelId)}
              <Area
                data={band.rows}
                y0={(d: CompareBandRow) => d.lo}
                y1={(d: CompareBandRow) => d.hi}
                fill={strokeFor(band.modelId).color}
                fillOpacity={0.08}
                {motion}
              />
            {/each}
            {#each context.series.visibleSeries as s (s.key)}
              <Spline seriesKey={s.key} {...s.props} />
            {/each}
          {/snippet}

          {#snippet aboveMarks()}
            {#if cutoff}
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
            {/if}
          {/snippet}

          {#snippet tooltip()}
            <Tooltip.Root variant="none">
              {#snippet children({ data })}
                {@const row = data as CompareRow}
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
                  {#each results as result (result.modelId)}
                    {@const value = row.models[result.modelId]}
                    {#if value != null && row.actual === null}
                      <ForecastTooltipRow
                        label={result.modelName}
                        value={formatCompactMoney(value)}
                        stroke={strokeFor(result.modelId)}
                      />
                    {/if}
                  {/each}
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
        {#each results as result (result.modelId)}
          <li class="flex items-center gap-1.5">
            <ModelSwatch stroke={strokeFor(result.modelId)} class="h-2 w-5" />
            {result.modelName}
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
