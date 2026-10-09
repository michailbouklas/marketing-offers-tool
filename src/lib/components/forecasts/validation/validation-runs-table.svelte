<script lang="ts">
  import ForecastEmptyState from "$lib/components/forecasts/widgets/forecast-empty-state.svelte";
  import ModelSwatch from "$lib/components/forecasts/widgets/model-swatch.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatCompactMoney,
    formatDayLabel,
    formatSignedPct,
  } from "$lib/services/forecasts/forecast-narrative";
  import {
    modelColorIndex,
    modelStroke,
    type ForecastModel,
  } from "$lib/services/forecasts/forecast-types";
  import {
    buildForecastValidationHref,
    defaultForecastValidationSortDir,
    forecastModelName,
    formatPct,
    type ForecastValidationFilters,
    type ForecastValidationPaginated,
    type ForecastValidationRunRow,
    type ForecastValidationSortField,
  } from "$lib/services/forecasts/forecast-validation";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import QualityBadge from "./quality-badge.svelte";
  import RunStatusBadge from "./run-status-badge.svelte";

  let {
    runsPage,
    filters,
    catalog,
    basePath,
  }: {
    runsPage: ForecastValidationPaginated<ForecastValidationRunRow>;
    filters: ForecastValidationFilters;
    /** Engine catalog (for colours); missing models fall back to index 0. */
    catalog: ForecastModel[];
    basePath: string;
  } = $props();

  const rows = $derived(runsPage.items);
  const page = $derived(runsPage.page);
  const totalPages = $derived(runsPage.totalPages);
  const totalItems = $derived(runsPage.totalItems);
  const pageSize = $derived(runsPage.pageSize);

  function pageHref(target: number): string {
    return buildForecastValidationHref(basePath, { ...filters, page: target });
  }

  function sortHref(field: ForecastValidationSortField): string {
    const dir =
      filters.sort === field
        ? filters.dir === "asc"
          ? "desc"
          : "asc"
        : defaultForecastValidationSortDir(field);
    return buildForecastValidationHref(basePath, {
      ...filters,
      sort: field,
      dir,
      page: 1,
    });
  }

  function visiblePages(): number[] {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from(
      { length: end - adjustedStart + 1 },
      (_, index) => adjustedStart + index,
    );
  }

  function strokeFor(modelId: string) {
    return modelStroke(modelColorIndex(modelId, catalog));
  }

  function detailHref(run: ForecastValidationRunRow): string {
    return `${basePath}/${run.id}`;
  }
</script>

{#snippet sortHead(
  field: ForecastValidationSortField,
  label: string,
  align: "left" | "right" = "left",
)}
  <Table.Head
    class={align === "right" ? "text-right" : ""}
    aria-sort={filters.sort === field
      ? filters.dir === "asc"
        ? "ascending"
        : "descending"
      : undefined}
  >
    <a
      href={sortHref(field)}
      class="inline-flex items-center gap-1 hover:underline"
    >
      {label}
      {#if filters.sort === field}
        {#if filters.dir === "asc"}
          <ArrowUpIcon class="size-3" />
        {:else}
          <ArrowDownIcon class="size-3" />
        {/if}
      {/if}
    </a>
  </Table.Head>
{/snippet}

<Card.Root>
  <Card.Header>
    <Card.Title>Runs</Card.Title>
    <Card.Description>
      {#if totalItems === 0}
        No recorded runs match the filters.
      {:else}
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of
        {totalItems} runs. Deviation is actual minus forecast over the whole window;
        WAPE is the mean daily miss.
      {/if}
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <ForecastEmptyState
        title="Nothing recorded yet"
        message="Record forecasts with the button above or run `bun run forecast:validate`, then come back once the window has passed to see how each model did."
      />
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              {@render sortHead("cutoff", "Cutoff")}
              <Table.Head>Window</Table.Head>
              {@render sortHead("brand", "Brand")}
              {@render sortHead("model", "Model")}
              <Table.Head>Status</Table.Head>
              <Table.Head class="text-right">Forecast</Table.Head>
              <Table.Head class="text-right">Actual</Table.Head>
              {@render sortHead("deviation", "Deviation", "right")}
              {@render sortHead("wape", "WAPE", "right")}
              <Table.Head>Quality</Table.Head>
              <Table.Head><span class="sr-only">Details</span></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each rows as run (run.id)}
              <Table.Row>
                <Table.Cell class="whitespace-nowrap tabular-nums">
                  {formatDayLabel(run.cutoffDate, { weekday: false })}
                </Table.Cell>
                <Table.Cell class="whitespace-nowrap">
                  {run.horizonDays} d
                  <span class="text-muted-foreground text-xs">
                    {formatDayLabel(run.forecastFrom, { weekday: false })} –
                    {formatDayLabel(run.forecastTo, { weekday: false })}
                  </span>
                </Table.Cell>
                <Table.Cell class="font-medium">
                  {run.brandName || run.brandAlias}
                </Table.Cell>
                <Table.Cell class="whitespace-nowrap">
                  <span class="inline-flex items-center gap-2">
                    <ModelSwatch
                      stroke={strokeFor(run.modelId)}
                      class="h-2 w-5"
                    />
                    {forecastModelName(run.modelId, catalog)}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span title={run.error ?? undefined}>
                    <RunStatusBadge status={run.status} />
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {run.status === "skipped" || run.status === "failed"
                    ? "—"
                    : formatCompactMoney(run.forecastTotal)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {#if run.actualTotal !== null}
                    {formatCompactMoney(run.actualTotal)}
                  {:else if run.status === "pending"}
                    <span class="text-muted-foreground text-xs">
                      due {formatDayLabel(run.evaluateAfter, {
                        weekday: false,
                      })}
                    </span>
                  {:else}
                    —
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatSignedPct(run.deviationPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(run.wapePct)}
                </Table.Cell>
                <Table.Cell>
                  {#if run.status === "evaluated"}
                    <QualityBadge quality={run.quality} />
                  {:else}
                    <span class="text-muted-foreground text-xs">—</span>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right">
                  <Button variant="ghost" size="sm" href={detailHref(run)}>
                    Details
                    <ArrowRightIcon />
                  </Button>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>

      {#if totalPages > 1}
        <div
          class="mt-6 flex flex-wrap items-center justify-end gap-2 border-t pt-4"
        >
          <Button
            variant="outline"
            href={pageHref(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          {#each visiblePages() as visiblePage (visiblePage)}
            <Button
              href={pageHref(visiblePage)}
              variant={visiblePage === page ? "default" : "outline"}
              size="sm"
            >
              {visiblePage}
            </Button>
          {/each}
          <Button
            variant="outline"
            href={pageHref(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
