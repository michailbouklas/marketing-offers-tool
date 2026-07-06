<script lang="ts">
  import { goto } from "$app/navigation";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    aggregatorLabel,
    aggregators,
    type AggregatorValue,
    type KpiFilters,
    type StoreRef,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    stores,
    filters,
    basePath,
  }: {
    stores: StoreRef[];
    filters: KpiFilters;
    /** Route these filters navigate to, e.g. "/aggregator-kpis/closures". */
    basePath: string;
  } = $props();

  // Narrow the store list to the selected platform so the dropdown stays short.
  const visibleStores = $derived(
    filters.aggregator
      ? stores.filter((store) => store.aggregator === filters.aggregator)
      : stores,
  );

  function buildHref(next: Partial<KpiFilters>): string {
    const merged: KpiFilters = { ...filters, ...next };
    const params = new URLSearchParams();

    if (merged.aggregator) {
      params.set("aggregator", merged.aggregator);
    }

    if (merged.storeId) {
      params.set("storeId", merged.storeId.toString());
    }

    if (merged.from) {
      params.set("from", merged.from);
    }

    if (merged.to) {
      params.set("to", merged.to);
    }

    const search = params.toString();

    return search ? `${basePath}?${search}` : basePath;
  }

  function onAggregatorChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const aggregator = value === "" ? null : (value as AggregatorValue);

    // Drop a store selection that no longer belongs to the chosen platform.
    const selectedStore = stores.find((store) => store.id === filters.storeId);
    const keepStore =
      aggregator === null ||
      (selectedStore ? selectedStore.aggregator === aggregator : false);

    goto(
      buildHref({ aggregator, storeId: keepStore ? filters.storeId : null }),
    );
  }

  function onStoreChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    goto(buildHref({ storeId: value === "" ? null : Number(value) }));
  }

  function applyDateRange(range: { from?: string; to?: string }) {
    goto(buildHref({ from: range.from ?? null, to: range.to ?? null }));
  }
</script>

<div class="flex flex-wrap items-end gap-3">
  <div class="space-y-2">
    <label class="text-sm font-medium" for="aggregator">Aggregator</label>
    <NativeSelect.Root
      id="aggregator"
      value={filters.aggregator ?? ""}
      onchange={onAggregatorChange}
    >
      <NativeSelect.Option value="">All platforms</NativeSelect.Option>
      {#each aggregators as aggregator (aggregator)}
        <NativeSelect.Option value={aggregator}>
          {aggregatorLabel(aggregator)}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="storeId">Store</label>
    <NativeSelect.Root
      id="storeId"
      value={filters.storeId?.toString() ?? ""}
      onchange={onStoreChange}
    >
      <NativeSelect.Option value="">All stores</NativeSelect.Option>
      {#each visibleStores as store (store.id)}
        <NativeSelect.Option value={store.id.toString()}>
          {store.name ?? `Store #${store.id}`}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="space-y-2">
    <span class="text-sm font-medium">Date range</span>
    <DateRangeFilter
      from={filters.from}
      to={filters.to}
      onApply={applyDateRange}
    />
  </div>
</div>
