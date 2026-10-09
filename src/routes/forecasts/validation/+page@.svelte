<script lang="ts">
  import QualityBadge from "$lib/components/forecasts/validation/quality-badge.svelte";
  import ValidationActionsCard from "$lib/components/forecasts/validation/validation-actions-card.svelte";
  import ValidationBreakdownTable from "$lib/components/forecasts/validation/validation-breakdown-table.svelte";
  import ValidationFilters from "$lib/components/forecasts/validation/validation-filters.svelte";
  import ValidationMatrix from "$lib/components/forecasts/validation/validation-matrix.svelte";
  import ValidationRunsTable from "$lib/components/forecasts/validation/validation-runs-table.svelte";
  import ValidationStatTile from "$lib/components/forecasts/validation/validation-stat-tile.svelte";
  import ForecastEmptyState from "$lib/components/forecasts/widgets/forecast-empty-state.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { formatDayLabel } from "$lib/services/forecasts/forecast-narrative";
  import { formatPct } from "$lib/services/forecasts/forecast-validation";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const BASE_PATH = "/forecasts/validation";

  const summary = $derived(data.summary);
  const latestBatch = $derived(data.facets.batches[0] ?? null);
  const showMatrix = $derived(
    data.matrix.brands.length >= 2 && summary.evaluated > 0,
  );
</script>

<svelte:head>
  <title>Forecast validation | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="How accurate the sales forecasts turned out: recorded forecasts per brand and model scored against the sales that actually happened."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Sales Forecasts
        </Badge>
        <Button
          variant="link"
          size="sm"
          href="/forecasts"
          class="text-muted-foreground h-auto p-0"
        >
          <ArrowLeftIcon />
          Back to forecasts
        </Button>
      </div>
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Forecast validation
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Every day a forecast is recorded, and once its window has passed it is
          scored against the sales that actually happened. Use it to see which
          model to trust for which brand, and how far off each run was.
        </p>
        <p class="text-muted-foreground/80 max-w-3xl text-sm leading-6">
          WAPE is the mean daily miss as a share of actual sales; quality uses
          the same thresholds as the forecast pages (high ≤ 12 %, medium ≤ 25
          %). Deviation is actual minus forecast over the whole window.
        </p>
      </div>
    </section>

    {#if data.isAdmin}
      <ValidationActionsCard
        inFlight={data.inFlight}
        lastRecord={data.lastRecord}
        {latestBatch}
        defaultDays={data.validationEnv.defaultDays}
        cron={data.validationEnv.cron}
        timezone={data.validationEnv.timezone}
      />
    {/if}

    {#if data.brands.length === 0}
      <ForecastEmptyState
        title="No brands assigned to you"
        message="Validation results are per brand. Ask an admin to assign you a brand and this page will fill in."
      />
    {:else}
      <ValidationFilters
        filters={data.filters}
        brands={data.brands}
        models={data.modelOptions}
        horizons={data.facets.horizons}
        batches={data.facets.batches}
        basePath={BASE_PATH}
      />

      <section
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="Summary"
      >
        <ValidationStatTile
          label="Recorded"
          value={String(summary.total)}
          hint={summary.skipped + summary.failed > 0
            ? `${summary.skipped} skipped · ${summary.failed} failed`
            : "runs matching the filters"}
        />
        <ValidationStatTile
          label="Evaluated"
          value={String(summary.evaluated)}
          hint={summary.pending > 0
            ? `${summary.pending} pending${summary.nextDue ? `, next due ${formatDayLabel(summary.nextDue, { weekday: false })}` : ""}`
            : "nothing pending"}
        />
        <ValidationStatTile
          label="Mean WAPE"
          value={formatPct(summary.meanWapePct)}
          hint="lower is better"
        />
        <ValidationStatTile
          label="Mean |deviation|"
          value={formatPct(summary.meanAbsDeviationPct)}
          hint={summary.meanBiasPct === null
            ? "window total vs forecast"
            : `bias ${summary.meanBiasPct > 0 ? "+" : ""}${summary.meanBiasPct.toFixed(1)} %`}
        />
        <ValidationStatTile
          label="Quality"
          value={summary.evaluated === 0
            ? "—"
            : `${Math.round((summary.qualityCounts.high / summary.evaluated) * 100)} % high`}
          hint={summary.meanCoverage80Pct === null
            ? null
            : `${formatPct(summary.meanCoverage80Pct, 0)} of days inside the 80 % range`}
        >
          {#if summary.evaluated > 0}
            <div class="flex flex-wrap gap-1">
              <QualityBadge
                quality="high"
                label={`${summary.qualityCounts.high}`}
              />
              <QualityBadge
                quality="medium"
                label={`${summary.qualityCounts.medium}`}
              />
              <QualityBadge
                quality="low"
                label={`${summary.qualityCounts.low}`}
              />
            </div>
          {/if}
        </ValidationStatTile>
      </section>

      <ValidationBreakdownTable
        groups={data.groups}
        filters={data.filters}
        catalog={data.modelOptions}
        basePath={BASE_PATH}
      />

      {#if showMatrix}
        <ValidationMatrix
          matrix={data.matrix}
          filters={data.filters}
          basePath={BASE_PATH}
        />
      {/if}

      <ValidationRunsTable
        runsPage={data.runsPage}
        filters={data.filters}
        catalog={data.models}
        basePath={BASE_PATH}
      />
    {/if}
  </main>
</div>
