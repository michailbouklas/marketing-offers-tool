<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    buildCompareTableRows,
    compareSpread,
  } from "$lib/services/forecasts/forecast-chart-data";
  import {
    forecastErrorCopy,
    formatAboutPct,
    formatCompactMoney,
    formatSignedPct,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastRunState } from "$lib/services/forecasts/forecast-runs.svelte";
  import {
    modelColorIndex,
    modelStroke,
    type ForecastModel,
    type ForecastResult,
  } from "$lib/services/forecasts/forecast-types";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import ConfidenceBadge from "./confidence-badge.svelte";
  import ModelSwatch from "./model-swatch.svelte";

  let {
    models,
    states,
    catalog,
    detailsHref,
    onRetry,
  }: {
    /** Selected models, in catalog order. */
    models: ForecastModel[];
    /** Per-model run state (missing = not started yet). */
    states: Record<string, ForecastRunState>;
    catalog: ForecastModel[];
    detailsHref: (modelId: string) => string;
    onRetry: (modelId: string) => void;
  } = $props();

  const readyResults = $derived(
    models
      .map((model) => states[model.id])
      .filter(
        (state): state is Extract<ForecastRunState, { status: "ready" }> =>
          state?.status === "ready",
      )
      .map((state) => state.result),
  );

  const rowsById = $derived(
    new Map(
      buildCompareTableRows(readyResults).map((row) => [row.modelId, row]),
    ),
  );

  const spread = $derived(compareSpread(readyResults));

  function resultFor(modelId: string): ForecastResult | null {
    const state = states[modelId];
    return state?.status === "ready" ? state.result : null;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>The numbers</Card.Title>
    <Card.Description>
      Expected total for the horizon and how it compares, per model. "Typical
      miss" is how far off each model was on recent days it had not seen.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <div class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Model</Table.Head>
            <Table.Head class="text-right">Expected total</Table.Head>
            <Table.Head class="text-right">vs last year</Table.Head>
            <Table.Head class="text-right">vs previous period</Table.Head>
            <Table.Head class="text-right">Avg / day</Table.Head>
            <Table.Head>Confidence</Table.Head>
            <Table.Head class="text-right">Typical miss</Table.Head>
            <Table.Head class="sr-only">Details</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each models as model (model.id)}
            {@const state = states[model.id]}
            {@const row = rowsById.get(model.id)}
            {@const stroke = modelStroke(modelColorIndex(model.id, catalog))}
            <Table.Row>
              <Table.Cell class="font-medium">
                <span class="flex items-center gap-2">
                  <ModelSwatch {stroke} />
                  {model.name}
                </span>
              </Table.Cell>
              {#if row && resultFor(model.id)}
                <Table.Cell class="text-right tabular-nums">
                  <span class="font-medium"
                    >{formatCompactMoney(row.total)}</span
                  >
                  <span class="text-muted-foreground block text-xs">
                    likely {formatCompactMoney(
                      row.lower80,
                    )}–{formatCompactMoney(row.upper80)}
                  </span>
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatSignedPct(row.vsLastYearPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatSignedPct(row.vsTrailingPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatCompactMoney(row.averageDaily)}
                </Table.Cell>
                <Table.Cell>
                  <ConfidenceBadge accuracy={row.accuracy} />
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {row.typicalMissPct === null
                    ? "—"
                    : formatAboutPct(row.typicalMissPct).replace(
                        /^about /,
                        "~",
                      )}
                </Table.Cell>
                <Table.Cell class="text-right">
                  <Button variant="link" size="sm" href={detailsHref(model.id)}>
                    Open details
                    <ArrowRightIcon />
                  </Button>
                </Table.Cell>
              {:else if !state || state.status === "loading"}
                <Table.Cell colspan={7}>
                  <div class="flex items-center gap-3" aria-busy="true">
                    <Skeleton class="h-4 w-24" />
                    <Skeleton class="h-4 w-16" />
                    <Skeleton class="h-4 w-16" />
                    <Skeleton class="h-4 w-32" />
                    <span class="sr-only"
                      >{model.name} forecast is loading.</span
                    >
                  </div>
                </Table.Cell>
              {:else if state.status === "error"}
                {@const copy = forecastErrorCopy(state.code, state.message)}
                <Table.Cell colspan={6}>
                  <span class="text-muted-foreground text-sm"
                    >{copy.title}.</span
                  >
                </Table.Cell>
                <Table.Cell class="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => onRetry(model.id)}
                  >
                    <RefreshCwIcon />
                    Try again
                  </Button>
                </Table.Cell>
              {/if}
            </Table.Row>
          {/each}
        </Table.Body>
        {#if spread}
          <Table.Footer>
            <Table.Row>
              <Table.Cell class="font-medium">Spread</Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatCompactMoney(spread.minTotal)} – {formatCompactMoney(
                  spread.maxTotal,
                )}
                <span class="text-muted-foreground block text-xs">
                  {Math.round(spread.spreadPct)} % apart · average {formatCompactMoney(
                    spread.averageTotal,
                  )}
                </span>
              </Table.Cell>
              <Table.Cell colspan={6}></Table.Cell>
            </Table.Row>
          </Table.Footer>
        {/if}
      </Table.Root>
    </div>
  </Card.Content>
</Card.Root>
