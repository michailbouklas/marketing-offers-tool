<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    defaultForecastValidationSortDir,
    forecastValidationQualities,
    forecastValidationQualityLabels,
    forecastValidationRunStatuses,
    forecastValidationStatusLabels,
    type ForecastValidationFilters,
  } from "$lib/services/forecasts/forecast-validation";

  /**
   * GET form over the URL filters of /forecasts/validation. Every select
   * submits on change; `page` is deliberately not carried over so a filter
   * change always lands on page 1. Group / sort survive as hidden fields.
   */
  let {
    filters,
    brands,
    models,
    horizons,
    batches,
    basePath,
  }: {
    filters: ForecastValidationFilters;
    brands: { alias: string; name: string }[];
    models: { id: string; name: string }[];
    horizons: number[];
    batches: { batchId: string; cutoffDate: string; runs: number }[];
    basePath: string;
  } = $props();

  let form: HTMLFormElement | null = null;

  function submit() {
    form?.requestSubmit();
  }

  const hasFilters = $derived(
    Boolean(
      filters.brand ||
      filters.model ||
      filters.horizon !== null ||
      filters.status ||
      filters.quality ||
      filters.batch,
    ),
  );

  // Keep a batch that is older than the facet list visible in the select.
  const batchOptions = $derived(
    filters.batch && !batches.some((batch) => batch.batchId === filters.batch)
      ? [{ batchId: filters.batch, cutoffDate: "", runs: 0 }, ...batches]
      : batches,
  );
</script>

<form
  method="GET"
  action={basePath}
  bind:this={form}
  class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto] lg:items-end"
>
  <div class="space-y-2">
    <label class="text-sm font-medium" for="validation-brand">Brand</label>
    <NativeSelect.Root
      id="validation-brand"
      name="brand"
      value={filters.brand ?? ""}
      onchange={submit}
    >
      <NativeSelect.Option value="">All brands</NativeSelect.Option>
      {#each brands as brand (brand.alias)}
        <NativeSelect.Option value={brand.alias.toLowerCase()}>
          {brand.name || brand.alias}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="validation-model">Model</label>
    <NativeSelect.Root
      id="validation-model"
      name="model"
      value={filters.model ?? ""}
      onchange={submit}
    >
      <NativeSelect.Option value="">All models</NativeSelect.Option>
      {#each models as model (model.id)}
        <NativeSelect.Option value={model.id}>{model.name}</NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="validation-horizon">Window</label>
    <NativeSelect.Root
      id="validation-horizon"
      name="horizon"
      value={filters.horizon === null ? "" : String(filters.horizon)}
      onchange={submit}
    >
      <NativeSelect.Option value="">Any length</NativeSelect.Option>
      {#each horizons as horizon (horizon)}
        <NativeSelect.Option value={String(horizon)}>
          {horizon} days
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="validation-status">Status</label>
    <NativeSelect.Root
      id="validation-status"
      name="status"
      value={filters.status ?? ""}
      onchange={submit}
    >
      <NativeSelect.Option value="">Any status</NativeSelect.Option>
      {#each forecastValidationRunStatuses as status (status)}
        <NativeSelect.Option value={status}>
          {forecastValidationStatusLabels[status]}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="validation-quality">Quality</label>
    <NativeSelect.Root
      id="validation-quality"
      name="quality"
      value={filters.quality ?? ""}
      onchange={submit}
    >
      <NativeSelect.Option value="">Any quality</NativeSelect.Option>
      {#each forecastValidationQualities as quality (quality)}
        <NativeSelect.Option value={quality}>
          {forecastValidationQualityLabels[quality]}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="validation-batch">Batch</label>
    <NativeSelect.Root
      id="validation-batch"
      name="batch"
      value={filters.batch ?? ""}
      onchange={submit}
    >
      <NativeSelect.Option value="">All batches</NativeSelect.Option>
      {#each batchOptions as batch (batch.batchId)}
        <NativeSelect.Option value={batch.batchId}>
          {batch.cutoffDate || batch.batchId.slice(0, 8)}
          {#if batch.runs > 0}
            &middot; {batch.runs} runs
          {/if}
          &middot; {batch.batchId.slice(0, 8)}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  {#if filters.group !== "model"}
    <input type="hidden" name="group" value={filters.group} />
  {/if}
  {#if filters.sort !== "cutoff"}
    <input type="hidden" name="sort" value={filters.sort} />
  {/if}
  {#if filters.dir !== defaultForecastValidationSortDir(filters.sort)}
    <input type="hidden" name="dir" value={filters.dir} />
  {/if}

  <div class="flex gap-2">
    <Button type="submit" variant="outline">Apply</Button>
    {#if hasFilters}
      <Button href={basePath} variant="ghost">Clear</Button>
    {/if}
  </div>
</form>
