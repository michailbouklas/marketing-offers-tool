<script lang="ts">
  import ForecastCompareChart from "$lib/components/forecasts/widgets/forecast-compare-chart.svelte";
  import ForecastCompareTable from "$lib/components/forecasts/widgets/forecast-compare-table.svelte";
  import ForecastEmptyState from "$lib/components/forecasts/widgets/forecast-empty-state.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { compareRecommendation } from "$lib/services/forecasts/forecast-narrative";
  import { ForecastRuns } from "$lib/services/forecasts/forecast-runs.svelte";
  import { buildForecastHref } from "$lib/services/forecasts/forecast-types";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { onDestroy, untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const runs = new ForecastRuns();

  $effect(() => {
    const input = {
      brand: data.filters.brand,
      horizonDays: data.filters.horizon,
      modelIds: [...data.filters.models],
    };
    untrack(() => runs.sync(input));
  });
  onDestroy(() => runs.cancelAll());

  const selectedModels = $derived(
    data.models.filter((model) => data.filters.models.includes(model.id)),
  );
  const readyResults = $derived(runs.readyResults(data.filters.models));

  // Only recommend once every selected model has finished (ready or failed).
  const settled = $derived(
    selectedModels.length > 0 &&
      selectedModels.every((model) => {
        const state = runs.results[model.id];
        return state !== undefined && state.status !== "loading";
      }),
  );

  function detailsHref(modelId: string): string {
    return buildForecastHref(
      `/forecasts/${modelId}`,
      data.filters,
      data.models,
    );
  }
</script>

{#if data.brands.length === 0}
  <ForecastEmptyState
    title="No brands assigned to you"
    message="Forecasts are per brand. Ask an admin to assign you a brand and this page will fill in."
  />
{:else if !data.filters.brand}
  <ForecastEmptyState
    title="Choose a brand"
    message="Pick one of your brands above to compare forecasts for it."
  />
{:else if selectedModels.length === 0}
  <ForecastEmptyState
    title="Pick the models to compare"
    message="Tick two or more forecasting methods above to see them side by side."
  />
{:else}
  <div class="flex flex-col gap-6" aria-live="polite" aria-busy={runs.isBusy}>
    {#if selectedModels.length < 2}
      <ForecastEmptyState
        title="Add a second model"
        message="Comparing needs at least two forecasting methods. Tick another one above — the table below still shows the one you picked."
      />
    {:else}
      <ForecastCompareChart results={readyResults} catalog={data.models} />
    {/if}

    <ForecastCompareTable
      models={selectedModels}
      states={runs.results}
      catalog={data.models}
      {detailsHref}
      onRetry={(modelId) => runs.retry(modelId)}
    />

    {#if settled && readyResults.length > 0}
      <Alert.Root class="bg-muted/40">
        <SparklesIcon />
        <Alert.Title>Which number to plan with</Alert.Title>
        <Alert.Description
          >{compareRecommendation(readyResults)}</Alert.Description
        >
      </Alert.Root>
    {/if}
  </div>
{/if}
