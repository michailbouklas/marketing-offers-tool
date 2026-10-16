<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { formatBrandLabel } from "$lib/services/brands";
  import {
    buildGoogleAnalyticsHref,
    googleAnalyticsRangeLabels,
    googleAnalyticsRangeOptions,
    type GoogleAnalyticsBrandScope,
    type GoogleAnalyticsFilters,
    type GoogleAnalyticsRange,
  } from "$lib/services/google-analytics/google-analytics";

  /** Above this many brands a button group stops being scannable. */
  const BUTTON_GROUP_MAX_BRANDS = 8;

  let {
    brands,
    filters,
    basePath,
  }: {
    /** Brands in the user's scope, each with its active properties. */
    brands: GoogleAnalyticsBrandScope[];
    /** Resolved filters (brand/property already defaulted by the server). */
    filters: GoogleAnalyticsFilters;
    basePath: string;
  } = $props();

  const controlsId = $props.id();

  const selected = $derived(
    brands.find((entry) => entry.brand.id === filters.brandId) ?? null,
  );

  const useButtonGroup = $derived(brands.length <= BUTTON_GROUP_MAX_BRANDS);

  function navigate(patch: Partial<GoogleAnalyticsFilters>) {
    goto(buildGoogleAnalyticsHref(basePath, { ...filters, ...patch }), {
      keepFocus: true,
      noScroll: true,
    });
  }

  function selectBrand(brandId: number) {
    if (brandId === filters.brandId) return;
    // A property belongs to one brand: switching brand resets to its first.
    navigate({ brandId, propertyId: null });
  }

  function onBrandSelectChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value.length > 0) {
      selectBrand(Number(value));
    }
  }

  function selectProperty(propertyId: string) {
    if (propertyId !== filters.propertyId) {
      navigate({ propertyId });
    }
  }

  function selectRange(range: GoogleAnalyticsRange) {
    if (range !== filters.range) {
      navigate({ range });
    }
  }
</script>

<div class="flex flex-wrap items-end gap-x-6 gap-y-4">
  <div class="space-y-2">
    {#if useButtonGroup}
      <span class="text-sm font-medium" id="{controlsId}-brand">Brand</span>
      <ButtonGroup.Root aria-labelledby="{controlsId}-brand" class="flex-wrap">
        {#each brands as entry (entry.brand.id)}
          <Button
            variant={entry.brand.id === filters.brandId ? "default" : "outline"}
            aria-pressed={entry.brand.id === filters.brandId}
            onclick={() => selectBrand(entry.brand.id)}
          >
            {formatBrandLabel(entry.brand)}
          </Button>
        {/each}
      </ButtonGroup.Root>
    {:else}
      <label class="text-sm font-medium" for="{controlsId}-brand">Brand</label>
      <NativeSelect.Root
        id="{controlsId}-brand"
        value={filters.brandId === null ? "" : String(filters.brandId)}
        onchange={onBrandSelectChange}
      >
        {#each brands as entry (entry.brand.id)}
          <NativeSelect.Option value={String(entry.brand.id)}>
            {formatBrandLabel(entry.brand)}
          </NativeSelect.Option>
        {/each}
      </NativeSelect.Root>
    {/if}
  </div>

  {#if selected && selected.properties.length > 1}
    <div class="space-y-2">
      <span class="text-sm font-medium" id="{controlsId}-property"
        >Property</span
      >
      <ButtonGroup.Root
        aria-labelledby="{controlsId}-property"
        class="flex-wrap"
      >
        {#each selected.properties as property (property.id)}
          <Button
            variant={property.id === filters.propertyId ? "default" : "outline"}
            aria-pressed={property.id === filters.propertyId}
            onclick={() => selectProperty(property.id)}
            title={`GA4 property ${property.propertyId}`}
          >
            {property.displayName}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>
  {/if}

  <div class="space-y-2">
    <span class="text-sm font-medium" id="{controlsId}-range">Period</span>
    <ButtonGroup.Root aria-labelledby="{controlsId}-range">
      {#each googleAnalyticsRangeOptions as range (range)}
        <Button
          variant={range === filters.range ? "default" : "outline"}
          aria-pressed={range === filters.range}
          onclick={() => selectRange(range)}
        >
          {googleAnalyticsRangeLabels[range]}
        </Button>
      {/each}
    </ButtonGroup.Root>
  </div>
</div>
