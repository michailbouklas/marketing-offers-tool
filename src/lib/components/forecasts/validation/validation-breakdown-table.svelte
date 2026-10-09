<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    buildForecastValidationHref,
    forecastModelName,
    forecastValidationGroupByLabels,
    forecastValidationGroupByOptions,
    formatPct,
    type ForecastValidationFilters,
    type ForecastValidationGroupBy,
    type ForecastValidationGroupRow,
  } from "$lib/services/forecasts/forecast-validation";
  import QualityBadge from "./quality-badge.svelte";

  /**
   * One row per model / brand / horizon / batch with mean metrics over the
   * evaluated runs that match the current filters. A row links to the runs
   * table filtered to that group.
   */
  let {
    groups,
    filters,
    catalog,
    basePath,
  }: {
    groups: ForecastValidationGroupRow[];
    filters: ForecastValidationFilters;
    catalog: { id: string; name: string }[];
    basePath: string;
  } = $props();

  const groupBy = $derived(filters.group);

  function groupHref(target: ForecastValidationGroupBy): string {
    return buildForecastValidationHref(basePath, {
      ...filters,
      group: target,
      page: 1,
    });
  }

  function filterHref(row: ForecastValidationGroupRow): string {
    const next: ForecastValidationFilters = { ...filters, page: 1 };
    switch (groupBy) {
      case "model":
        next.model = row.key;
        break;
      case "brand":
        next.brand = row.key.toLowerCase();
        break;
      case "horizon":
        next.horizon = Number.parseInt(row.key, 10);
        break;
      case "batch":
        next.batch = row.key;
        break;
    }
    return buildForecastValidationHref(basePath, next);
  }
</script>

<Card.Root>
  <Card.Header>
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="space-y-1">
        <Card.Title>Breakdown</Card.Title>
        <Card.Description>
          Mean error over the evaluated runs that match the filters above. Lower
          WAPE is better; bias above zero means the model forecast too high.
        </Card.Description>
      </div>
      <nav aria-label="Group by" class="flex flex-wrap gap-1">
        {#each forecastValidationGroupByOptions as option (option)}
          <Button
            variant={option === groupBy ? "secondary" : "ghost"}
            size="sm"
            href={groupHref(option)}
            aria-current={option === groupBy ? "true" : undefined}
          >
            {forecastValidationGroupByLabels[option]}
          </Button>
        {/each}
      </nav>
    </div>
  </Card.Header>
  <Card.Content>
    {#if groups.length === 0}
      <p class="text-muted-foreground text-sm">No runs match these filters.</p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head
                >{forecastValidationGroupByLabels[groupBy].replace(
                  "By ",
                  "",
                )}</Table.Head
              >
              <Table.Head class="text-right">Runs</Table.Head>
              <Table.Head class="text-right">Evaluated</Table.Head>
              <Table.Head class="text-right">Mean WAPE</Table.Head>
              <Table.Head class="text-right">Mean |deviation|</Table.Head>
              <Table.Head class="text-right">Bias</Table.Head>
              <Table.Head class="text-right">In 80 % range</Table.Head>
              <Table.Head>Quality</Table.Head>
              {#if groupBy !== "model"}
                <Table.Head>Best model</Table.Head>
              {/if}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each groups as row (row.key)}
              <Table.Row>
                <Table.Cell class="font-medium">
                  <a href={filterHref(row)} class="hover:underline"
                    >{row.label}</a
                  >
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {row.runs}
                  {#if row.pending > 0}
                    <span class="text-muted-foreground text-xs">
                      ({row.pending} pending)
                    </span>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums"
                  >{row.evaluated}</Table.Cell
                >
                <Table.Cell class="text-right tabular-nums">
                  <span class="inline-flex items-center gap-2">
                    {formatPct(row.meanWapePct)}
                    {#if row.meanWapePct !== null}
                      <QualityBadge
                        quality={row.meanWapePct <= 12
                          ? "high"
                          : row.meanWapePct <= 25
                            ? "medium"
                            : "low"}
                        label=""
                        class="px-1"
                      />
                    {/if}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(row.meanAbsDeviationPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {row.meanBiasPct === null
                    ? "—"
                    : `${row.meanBiasPct > 0 ? "+" : ""}${row.meanBiasPct.toFixed(1)} %`}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(row.meanCoverage80Pct, 0)}
                </Table.Cell>
                <Table.Cell>
                  {#if row.evaluated === 0}
                    <span class="text-muted-foreground text-xs"
                      >not scored yet</span
                    >
                  {:else}
                    <span class="flex flex-wrap gap-1 text-xs">
                      <span class="text-emerald-700 dark:text-emerald-300">
                        {row.qualityCounts.high} high
                      </span>
                      <span class="text-amber-700 dark:text-amber-300">
                        {row.qualityCounts.medium} medium
                      </span>
                      <span class="text-rose-700 dark:text-rose-300">
                        {row.qualityCounts.low} low
                      </span>
                    </span>
                  {/if}
                </Table.Cell>
                {#if groupBy !== "model"}
                  <Table.Cell>
                    {#if row.bestModelId}
                      {forecastModelName(row.bestModelId, catalog)}
                      <span class="text-muted-foreground text-xs">
                        ({formatPct(row.bestModelWapePct)})
                      </span>
                    {:else}
                      <span class="text-muted-foreground">—</span>
                    {/if}
                  </Table.Cell>
                {/if}
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
