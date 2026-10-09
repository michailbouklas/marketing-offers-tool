<script lang="ts">
  import QualityBadge from "$lib/components/forecasts/validation/quality-badge.svelte";
  import RunStatusBadge from "$lib/components/forecasts/validation/run-status-badge.svelte";
  import ValidationRunChart from "$lib/components/forecasts/validation/validation-run-chart.svelte";
  import ValidationStatTile from "$lib/components/forecasts/validation/validation-stat-tile.svelte";
  import ForecastChartBoundary from "$lib/components/forecasts/widgets/forecast-chart-boundary.svelte";
  import ModelSwatch from "$lib/components/forecasts/widgets/model-swatch.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    forecastWarningCopy,
    formatDayLabel,
    formatMoney,
    formatMoneyRange,
    formatSignedPct,
    weekdayName,
  } from "$lib/services/forecasts/forecast-narrative";
  import {
    modelColorIndex,
    modelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import {
    forecastModelName,
    formatPct,
    gradeForWape,
    type ForecastValidationRunPoint,
  } from "$lib/services/forecasts/forecast-validation";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const run = $derived(data.run);
  const modelName = $derived(forecastModelName(run.modelId, data.models));
  const stroke = $derived(
    modelStroke(modelColorIndex(run.modelId, data.models)),
  );
  const evaluated = $derived(run.status === "evaluated");
  const hasPoints = $derived(run.points.length > 0);

  function pointError(point: ForecastValidationRunPoint): number | null {
    return point.actual === null ? null : point.actual - point.yhat;
  }

  function pointErrorPct(point: ForecastValidationRunPoint): number | null {
    if (point.actual === null || point.actual === 0) {
      return null;
    }
    return ((point.actual - point.yhat) / point.actual) * 100;
  }

  function inRange(point: ForecastValidationRunPoint): boolean | null {
    if (point.actual === null) {
      return null;
    }
    return point.actual >= point.lo80 && point.actual <= point.hi80;
  }

  function formatDateTime(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString() : "—";
  }

  /** The engine's own backtest grade, in the same words as the quality badge. */
  const backtestQuality = $derived(
    run.backtestWapePct === null ? null : gradeForWape(run.backtestWapePct),
  );
</script>

<svelte:head>
  <title>
    {run.brandName || run.brandAlias} · {modelName} · Forecast validation
  </title>
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a href="/forecasts" class="hover:text-foreground transition-colors">
        Sales Forecasts
      </a>
      <ChevronRightIcon class="size-3" />
      <a
        href="/forecasts/validation"
        class="hover:text-foreground transition-colors"
      >
        Validation
      </a>
      <ChevronRightIcon class="size-3" />
      <span>Run #{run.id}</span>
    </div>

    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        {#if evaluated}
          <QualityBadge quality={run.quality} />
        {/if}
        <Badge variant="outline" class="font-normal">
          {run.horizonDays}-day window
        </Badge>
      </div>
      <h1 class="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
        {run.brandName || run.brandAlias}
        <span class="text-muted-foreground font-normal">·</span>
        <span class="inline-flex items-center gap-2">
          <ModelSwatch {stroke} class="h-3 w-7" />
          {modelName}
        </span>
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Forecast made from sales up to
        <strong>{formatDayLabel(run.cutoffDate, { year: true })}</strong>
        for {formatDayLabel(run.forecastFrom)} – {formatDayLabel(
          run.forecastTo,
          { year: true },
        )}.
        {#if run.status === "pending"}
          It will be scored once the warehouse has sales through {formatDayLabel(
            run.evaluateAfter,
          )}.
        {:else if evaluated && run.evaluatedAt}
          Scored on {formatDateTime(run.evaluatedAt)}.
        {/if}
      </p>
    </section>

    {#if run.error}
      <Alert.Root variant={run.status === "failed" ? "destructive" : "default"}>
        <TriangleAlertIcon />
        <Alert.Title>
          {run.status === "skipped"
            ? "This brand could not be forecast"
            : "This run did not complete"}
        </Alert.Title>
        <Alert.Description>{run.error}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if hasPoints}
      <section
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Totals"
      >
        <ValidationStatTile
          label="Forecast"
          value={formatMoney(run.forecastTotal)}
          hint="likely {formatMoneyRange(
            run.forecastLower80,
            run.forecastUpper80,
          )}"
        />
        <ValidationStatTile
          label="Actual"
          value={run.actualTotal === null ? "—" : formatMoney(run.actualTotal)}
          hint={run.actualDays === null
            ? "not scored yet"
            : `${run.actualDays} of ${run.horizonDays} days had sales`}
        />
        <ValidationStatTile
          label="Deviation"
          value={run.deviation === null ? "—" : formatMoney(run.deviation)}
          hint={run.deviationPct === null
            ? "actual minus forecast"
            : `${formatSignedPct(run.deviationPct)} of actual`}
        />
        <ValidationStatTile
          label="WAPE"
          value={formatPct(run.wapePct)}
          hint={run.biasPct === null
            ? "mean daily miss"
            : `bias ${formatSignedPct(run.biasPct)} · ${formatPct(run.coverage80Pct, 0)} of days in range`}
        >
          {#if backtestQuality}
            <p class="text-muted-foreground text-xs">
              Backtest at run time: {formatPct(run.backtestWapePct)}
              <QualityBadge
                quality={backtestQuality}
                class="ml-1 px-1"
                label=""
              />
            </p>
          {/if}
        </ValidationStatTile>
      </section>

      <Card.Root>
        <Card.Header>
          <Card.Title>Day by day</Card.Title>
          <Card.Description>
            The dashed line is the forecast, the hatched band its likely range;
            the solid line is what actually sold.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <ForecastChartBoundary>
            <ValidationRunChart points={run.points} {modelName} {stroke} />
          </ForecastChartBoundary>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Daily figures</Card.Title>
        </Card.Header>
        <Card.Content>
          <div class="overflow-x-auto">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Day</Table.Head>
                  <Table.Head class="text-right">Forecast</Table.Head>
                  <Table.Head class="text-right">Likely range</Table.Head>
                  <Table.Head class="text-right">Actual</Table.Head>
                  <Table.Head class="text-right">Actual vs forecast</Table.Head>
                  <Table.Head class="text-center">In range</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each run.points as point (point.ds)}
                  {@const err = pointError(point)}
                  {@const within = inRange(point)}
                  <Table.Row>
                    <Table.Cell class="whitespace-nowrap">
                      {formatDayLabel(point.ds, { weekday: false })}
                      <span class="text-muted-foreground text-xs">
                        {weekdayName(point.ds)}
                      </span>
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {formatMoney(point.yhat)}
                    </Table.Cell>
                    <Table.Cell
                      class="text-muted-foreground text-right tabular-nums"
                    >
                      {formatMoneyRange(point.lo80, point.hi80)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {point.actual === null ? "—" : formatMoney(point.actual)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {#if err === null}
                        —
                      {:else}
                        {formatMoney(err)}
                        <span class="text-muted-foreground text-xs">
                          ({formatSignedPct(pointErrorPct(point))})
                        </span>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="text-center">
                      {#if within === null}
                        <span class="text-muted-foreground">—</span>
                      {:else if within}
                        <CheckIcon
                          class="inline size-4 text-emerald-700 dark:text-emerald-300"
                          aria-label="inside the likely range"
                        />
                      {:else}
                        <TriangleAlertIcon
                          class="inline size-4 text-amber-700 dark:text-amber-300"
                          aria-label="outside the likely range"
                        />
                      {/if}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <div class="grid gap-6 lg:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>About this run</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">Recorded</dt>
              <dd class="font-medium">
                {formatDateTime(run.createdAt)}
                <span class="text-muted-foreground text-xs"
                  >via {run.trigger}</span
                >
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Batch</dt>
              <dd class="font-mono text-xs">
                <a
                  href="/forecasts/validation?batch={run.batchId}"
                  class="hover:underline"
                >
                  {run.batchId}
                </a>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Model version</dt>
              <dd class="font-medium">
                {run.modelVersion || "—"}
                {#if run.engineVersion}
                  <span class="text-muted-foreground text-xs">
                    engine {run.engineVersion}
                  </span>
                {/if}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Evaluate after</dt>
              <dd class="font-medium">
                {formatDayLabel(run.evaluateAfter, { year: true })}
              </dd>
            </div>
          </dl>
          {#if run.warnings.length > 0}
            <h3 class="mt-4 text-sm font-medium">Engine notes at run time</h3>
            <ul class="text-muted-foreground mt-1 space-y-1 text-sm">
              {#each run.warnings as warning, index (index)}
                <li>{forecastWarningCopy(warning.code, warning.message)}</li>
              {/each}
            </ul>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Same batch, other models</Card.Title>
          <Card.Description>
            The other models recorded for {run.brandName || run.brandAlias} on the
            same day.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if data.siblings.length === 0}
            <p class="text-muted-foreground text-sm">
              No other models were recorded in this batch.
            </p>
          {:else}
            <ul class="divide-y">
              {#each data.siblings as sibling (sibling.id)}
                <li
                  class="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <a
                    href="/forecasts/validation/{sibling.id}"
                    class="inline-flex items-center gap-2 font-medium hover:underline"
                  >
                    <ModelSwatch
                      stroke={modelStroke(
                        modelColorIndex(sibling.modelId, data.models),
                      )}
                      class="h-2 w-5"
                    />
                    {forecastModelName(sibling.modelId, data.models)}
                  </a>
                  <span class="flex items-center gap-2 text-sm tabular-nums">
                    {#if sibling.status === "evaluated"}
                      <span>WAPE {formatPct(sibling.wapePct)}</span>
                      <QualityBadge quality={sibling.quality} />
                    {:else}
                      <RunStatusBadge status={sibling.status} />
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>

    <div>
      <Button variant="outline" href="/forecasts/validation">
        <ArrowLeftIcon />
        All validation runs
      </Button>
    </div>
  </main>
</div>
