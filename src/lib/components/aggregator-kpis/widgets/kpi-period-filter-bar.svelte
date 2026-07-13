<script lang="ts">
  import { goto } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    periodKindLabel,
    periodKinds,
    type PeriodFilters,
    type PeriodKind,
    type StoreRef,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    stores,
    filters,
    basePath,
    showPeriod = true,
  }: {
    /** Foody stores only (these views are Foody-scoped). */
    stores: StoreRef[];
    filters: PeriodFilters;
    /** Route these filters navigate to, e.g. "/aggregator-kpis/metrics". */
    basePath: string;
    /** Hide the Week/Month toggle (for views with no period lane, e.g. ratings). */
    showPeriod?: boolean;
  } = $props();

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
    <div>
      <Badge
        variant="outline"
        class="h-9 px-3 text-[0.7rem] tracking-[0.18em] uppercase"
      >
        Foody
      </Badge>
    </div>
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
