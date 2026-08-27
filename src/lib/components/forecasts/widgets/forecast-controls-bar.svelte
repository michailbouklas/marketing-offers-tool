<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { formatBrandLabel } from "$lib/services/brands";
  import { insufficientHistorySentence } from "$lib/services/forecasts/forecast-narrative";
  import {
    buildForecastHref,
    forecastHorizonLabels,
    forecastHorizonOptions,
    modelColorIndex,
    modelStroke,
    type ForecastFilters,
    type ForecastHorizonDays,
    type ForecastModel,
  } from "$lib/services/forecasts/forecast-types";
  import GitCompareArrowsIcon from "@lucide/svelte/icons/git-compare-arrows";
  import ForecastModelCheckboxCard from "./forecast-model-checkbox-card.svelte";

  type BrandRef = { alias: string; name: string };

  let {
    brands,
    models,
    filters,
    historyDays = null,
    basePath,
    compareBasePath = "/forecasts/compare",
    showModels = true,
    /** Catalogs larger than this collapse into a popover list. */
    compactThreshold = 6,
  }: {
    /** Brands in the user's scope; a single brand renders as a static label. */
    brands: BrandRef[];
    /** Engine catalog (empty when the engine is unavailable). */
    models: ForecastModel[];
    filters: ForecastFilters;
    /** Days of usable history for the selected brand; null while unknown. */
    historyDays?: number | null;
    /** Route the filters navigate to (usually the current pathname). */
    basePath: string;
    compareBasePath?: string;
    /** Hide the model pickers (deep-dive page is single-model by design). */
    showModels?: boolean;
    compactThreshold?: number;
  } = $props();

  const brandId = $props.id();

  const brand = $derived(
    brands.find((candidate) => candidate.alias === filters.brand) ?? null,
  );
  const compact = $derived(models.length > compactThreshold);
  const compareHref = $derived(
    buildForecastHref(compareBasePath, filters, models),
  );
  const selectedCount = $derived(filters.models.length);

  function navigate(next: Partial<ForecastFilters>) {
    void goto(buildForecastHref(basePath, { ...filters, ...next }, models), {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  function onBrandChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    navigate({ brand: value.length > 0 ? value : null });
  }

  function toggleModel(modelId: string, checked: boolean) {
    const selected = new Set(filters.models);
    if (checked) {
      selected.add(modelId);
    } else {
      selected.delete(modelId);
    }
    // Keep catalog order so URLs stay canonical.
    navigate({
      models: models.map((m) => m.id).filter((id) => selected.has(id)),
    });
  }

  function selectHorizon(horizon: ForecastHorizonDays) {
    if (horizon !== filters.horizon) {
      navigate({ horizon });
    }
  }

  function isSelected(model: ForecastModel): boolean {
    return filters.models.includes(model.id);
  }

  // A model that needs more history than the brand has cannot be selected;
  // an already-selected one stays toggleable so it can be removed.
  function isDisabled(model: ForecastModel): boolean {
    return (
      historyDays !== null &&
      model.minHistoryDays > historyDays &&
      !isSelected(model)
    );
  }

  function disabledReason(model: ForecastModel): string | null {
    if (!isDisabled(model)) {
      return null;
    }
    return insufficientHistorySentence({
      brandName: brand?.name ?? "This brand",
      modelName: model.name,
      historyDays,
      minHistoryDays: model.minHistoryDays,
    });
  }
</script>

<div
  class="border-border/70 bg-background/88 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm backdrop-blur"
>
  <div class="flex flex-wrap items-end gap-4">
    <div class="space-y-2">
      <label class="text-sm font-medium" for="forecast-brand-{brandId}"
        >Brand</label
      >
      {#if brands.length === 1 && brand}
        <p
          id="forecast-brand-{brandId}"
          class="flex h-8 items-center text-sm font-medium"
        >
          {formatBrandLabel(brand)}
        </p>
      {:else}
        <NativeSelect.Root
          id="forecast-brand-{brandId}"
          value={filters.brand ?? ""}
          onchange={onBrandChange}
        >
          {#if !filters.brand}
            <NativeSelect.Option value="">Choose a brand</NativeSelect.Option>
          {/if}
          {#each brands as option (option.alias)}
            <NativeSelect.Option value={option.alias}>
              {formatBrandLabel(option)}
            </NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
      {/if}
    </div>

    <div class="space-y-2">
      <span class="text-sm font-medium" id="forecast-horizon-{brandId}"
        >Horizon</span
      >
      <ButtonGroup.Root aria-labelledby="forecast-horizon-{brandId}">
        {#each forecastHorizonOptions as horizon (horizon)}
          <Button
            variant={filters.horizon === horizon ? "default" : "outline"}
            aria-pressed={filters.horizon === horizon}
            onclick={() => selectHorizon(horizon)}
          >
            {forecastHorizonLabels[horizon]}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    {#if showModels && selectedCount >= 2 && basePath !== compareBasePath}
      <div class="ml-auto">
        <Button variant="outline" href={compareHref}>
          <GitCompareArrowsIcon />
          Compare selected
        </Button>
      </div>
    {/if}
  </div>

  {#if showModels}
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium">Models</span>
        <span class="text-muted-foreground text-xs">
          {#if models.length === 0}
            No models available right now
          {:else}
            {selectedCount} of {models.length} selected · each runs on its own
          {/if}
        </span>
      </div>

      {#if models.length === 0}
        <p class="text-muted-foreground text-sm">
          The forecast service did not report any models. Actual sales still
          load; forecasts will appear once the service is back.
        </p>
      {:else if compact}
        <Popover.Root>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button variant="outline" {...props}>
                {selectedCount} of {models.length} models selected
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content class="w-96 space-y-2" align="start">
            {#each models as model (model.id)}
              <ForecastModelCheckboxCard
                {model}
                stroke={modelStroke(modelColorIndex(model.id, models))}
                checked={isSelected(model)}
                disabled={isDisabled(model)}
                disabledReason={disabledReason(model)}
                onToggle={(checked) => toggleModel(model.id, checked)}
              />
            {/each}
          </Popover.Content>
        </Popover.Root>
      {:else}
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {#each models as model (model.id)}
            <ForecastModelCheckboxCard
              {model}
              stroke={modelStroke(modelColorIndex(model.id, models))}
              checked={isSelected(model)}
              disabled={isDisabled(model)}
              disabledReason={disabledReason(model)}
              onToggle={(checked) => toggleModel(model.id, checked)}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
