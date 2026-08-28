<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ForecastAgreementNote from "$lib/components/forecasts/widgets/forecast-agreement-note.svelte";
  import ForecastEmptyState from "$lib/components/forecasts/widgets/forecast-empty-state.svelte";
  import ForecastErrorCard from "$lib/components/forecasts/widgets/forecast-error-card.svelte";
  import ForecastInsufficientHistoryCard from "$lib/components/forecasts/widgets/forecast-insufficient-history-card.svelte";
  import ForecastResultCard from "$lib/components/forecasts/widgets/forecast-result-card.svelte";
  import ForecastResultSkeleton from "$lib/components/forecasts/widgets/forecast-result-skeleton.svelte";
  import { ForecastRuns } from "$lib/services/forecasts/forecast-runs.svelte";
  import {
    buildForecastHref,
    modelColorIndex,
    modelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import { onDestroy, untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const runs = new ForecastRuns();

  // The URL is the source of truth: whenever the resolved filters change,
  // reconcile the in-flight requests. `untrack` keeps the effect from
  // re-running on the state `sync` itself writes.
  $effect(() => {
    const input = {
      brand: data.filters.brand,
      horizonDays: data.filters.horizon,
      locationId: data.filters.location,
      modelIds: [...data.filters.models],
    };
    untrack(() => runs.sync(input));
  });
  onDestroy(() => runs.cancelAll());

  const selectedModels = $derived(
    data.models.filter((model) => data.filters.models.includes(model.id)),
  );
  const readyResults = $derived(runs.readyResults(data.filters.models));
  const historyDays = $derived(data.historyDays ?? runs.historyDays);
  const brandName = $derived(data.brand?.name ?? "This brand");
  const compareHref = $derived(
    buildForecastHref("/forecasts/compare", data.filters, data.models),
  );

  function detailsHref(modelId: string): string {
    return buildForecastHref(
      `/forecasts/${modelId}`,
      data.filters,
      data.models,
    );
  }

  function removeModel(modelId: string) {
    void goto(
      buildForecastHref(
        page.url.pathname,
        {
          ...data.filters,
          models: data.filters.models.filter((id) => id !== modelId),
        },
        data.models,
      ),
      { replaceState: true, keepFocus: true, noScroll: true },
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
    message="Pick one of your brands above to see what it is likely to sell."
  />
{:else if selectedModels.length === 0}
  <ForecastEmptyState
    title={data.engineStatus === "unavailable"
      ? "Forecast models are unavailable"
      : "Pick at least one model"}
    message={data.engineStatus === "unavailable"
      ? "The forecasting service is not reachable, so there is nothing to run yet. Reload in a moment."
      : "Tick one or more forecasting methods above. Each one runs on its own, and picking two lets you see where they agree."}
  />
{:else}
  <section
    class="grid gap-6 xl:grid-cols-2"
    aria-live="polite"
    aria-busy={runs.isBusy}
  >
    {#each selectedModels as model (model.id)}
      {@const state = runs.results[model.id]}
      {@const stroke = modelStroke(modelColorIndex(model.id, data.models))}
      {#if !state || state.status === "loading"}
        <ForecastResultSkeleton modelName={model.name} />
      {:else if state.status === "ready"}
        <ForecastResultCard
          result={state.result}
          {model}
          {stroke}
          detailsHref={detailsHref(model.id)}
          onRefresh={() => runs.retry(model.id)}
        />
      {:else if state.code === "INSUFFICIENT_HISTORY"}
        <ForecastInsufficientHistoryCard
          {brandName}
          modelName={model.name}
          {historyDays}
          minHistoryDays={model.minHistoryDays}
          message={state.message}
          onRemove={selectedModels.length > 1
            ? () => removeModel(model.id)
            : null}
        />
      {:else}
        <ForecastErrorCard
          {model}
          code={state.code}
          message={state.message}
          onRetry={() => runs.retry(model.id)}
          onRemove={selectedModels.length > 1
            ? () => removeModel(model.id)
            : null}
        />
      {/if}
    {/each}
  </section>

  {#if readyResults.length >= 2}
    <ForecastAgreementNote results={readyResults} {compareHref} />
  {/if}
{/if}
