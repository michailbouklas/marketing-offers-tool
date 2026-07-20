<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    aggregatorLabel,
    aggregators,
    periodKindLabel,
    periodKinds,
    type AggregatorValue,
    type PeriodFilters,
    type PeriodKind,
    type StoreRef,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import { aggregatorStore } from "$lib/state/aggregator.svelte";

  let {
    stores,
    filters,
    basePath,
    showPeriod = true,
  }: {
    /** Stores for the active platform (the loader scopes this by aggregator). */
    stores: StoreRef[];
    filters: PeriodFilters;
    /** Route these filters navigate to, e.g. "/aggregator-kpis/metrics". */
    basePath: string;
    /** Hide the Week/Month toggle (for views with no period lane, e.g. ratings). */
    showPeriod?: boolean;
  } = $props();

  function selectAggregator(next: AggregatorValue) {
    if (next === aggregatorStore.current) {
      return;
    }
    // Persist the choice, then reset to the base path: a stored store id belongs
    // to the old platform (cross-aggregator ids are unrelated), and the reload
    // re-reads the cookie server-side to fetch the new platform's data.
    aggregatorStore.set(next);
    void goto(basePath, { invalidateAll: true });
  }

  function buildHref(next: Partial<PeriodFilters>): string {
    const merged: PeriodFilters = { ...filters, ...next };
    const params = new URLSearchParams();

    if (merged.period !== "week") {
      params.set("period", merged.period);
    }

    if (merged.storeId) {
      params.set("storeId", merged.storeId.toString());
    }

    const search = params.toString();

    return search ? `${basePath}?${search}` : basePath;
  }

  function onStoreChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    goto(buildHref({ storeId: value === "" ? null : Number(value) }));
  }

  function selectPeriod(period: PeriodKind) {
    if (period !== filters.period) {
      goto(buildHref({ period }));
    }
  }
</script>

<div class="flex flex-wrap items-end gap-3">
  <div class="space-y-2">
    <span class="text-sm font-medium">Platform</span>
    <ButtonGroup.Root>
      {#each aggregators as aggregator (aggregator)}
        <Button
          variant={aggregatorStore.current === aggregator
            ? "default"
            : "outline"}
          onclick={() => selectAggregator(aggregator)}
        >
          {aggregatorLabel(aggregator)}
        </Button>
      {/each}
    </ButtonGroup.Root>
  </div>

  <div class="space-y-2">
    <label class="text-sm font-medium" for="storeId">Store</label>
    <NativeSelect.Root
      id="storeId"
      value={filters.storeId?.toString() ?? ""}
      onchange={onStoreChange}
    >
      <NativeSelect.Option value="">All stores</NativeSelect.Option>
      {#each stores as store (store.id)}
        <NativeSelect.Option value={store.id.toString()}>
          {store.name ?? `Store #${store.id}`}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  {#if showPeriod}
    <div class="space-y-2">
      <span class="text-sm font-medium">Period</span>
      <ButtonGroup.Root>
        {#each periodKinds as period (period)}
          <Button
            variant={filters.period === period ? "default" : "outline"}
            onclick={() => selectPeriod(period)}
          >
            {periodKindLabel(period)}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>
  {/if}
</div>
