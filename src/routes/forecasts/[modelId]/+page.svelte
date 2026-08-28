<script lang="ts">
  import ForecastDayTable from "$lib/components/forecasts/widgets/forecast-day-table.svelte";
  import ForecastEmptyState from "$lib/components/forecasts/widgets/forecast-empty-state.svelte";
  import ForecastErrorCard from "$lib/components/forecasts/widgets/forecast-error-card.svelte";
  import ForecastInsufficientHistoryCard from "$lib/components/forecasts/widgets/forecast-insufficient-history-card.svelte";
  import ForecastResultCard from "$lib/components/forecasts/widgets/forecast-result-card.svelte";
  import ForecastResultSkeleton from "$lib/components/forecasts/widgets/forecast-result-skeleton.svelte";
  import { ForecastRuns } from "$lib/services/forecasts/forecast-runs.svelte";
  import {
    modelColorIndex,
    modelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import { onDestroy, untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const runs = new ForecastRuns();

  $effect(() => {
    const input = {
      brand: data.filters.brand,
      horizonDays: data.filters.horizon,
      locationId: data.filters.location,
      modelIds: [data.model.id],
    };
    untrack(() => runs.sync(input));
  });
  onDestroy(() => runs.cancelAll());

  const model = $derived(data.model);
  const state = $derived(runs.results[model.id]);
  const stroke = $derived(modelStroke(modelColorIndex(model.id, data.models)));
  const historyDays = $derived(data.historyDays ?? runs.historyDays);
  const brandName = $derived(data.brand?.name ?? "This brand");
</script>

<svelte:head>
  <title>{model.name} forecast | Sales Forecasts</title>
</svelte:head>

{#if data.brands.length === 0}
  <ForecastEmptyState
    title="No brands assigned to you"
    message="Forecasts are per brand. Ask an admin to assign you a brand and this page will fill in."
  />
{:else if !data.filters.brand}
  <ForecastEmptyState
    title="Choose a brand"
    message="Pick one of your brands above to see the {model.name} forecast for it."
  />
{:else}
  <div class="flex flex-col gap-6" aria-live="polite" aria-busy={runs.isBusy}>
    {#if !state || state.status === "loading"}
      <ForecastResultSkeleton modelName={model.name} />
    {:else if state.status === "ready"}
      <ForecastResultCard
        result={state.result}
        {model}
        {stroke}
        variant="full"
        showWideBand
        onRefresh={() => runs.retry(model.id)}
      />
      <ForecastDayTable result={state.result} />
    {:else if state.code === "INSUFFICIENT_HISTORY"}
      <ForecastInsufficientHistoryCard
        {brandName}
        modelName={model.name}
        {historyDays}
        minHistoryDays={model.minHistoryDays}
        message={state.message}
      />
    {:else}
      <ForecastErrorCard
        {model}
        code={state.code}
        message={state.message}
        onRetry={() => runs.retry(model.id)}
      />
    {/if}
  </div>
{/if}
