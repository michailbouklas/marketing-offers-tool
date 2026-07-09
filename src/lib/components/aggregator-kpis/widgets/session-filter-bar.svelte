<script lang="ts">
  import { goto } from "$app/navigation";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import {
    aggregatorLabel,
    aggregators,
    scrapeRunStatusLabel,
    scrapeRunStatuses,
    type AggregatorValue,
    type ScrapeRunStatus,
    type SessionFilters,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    filters,
    basePath = "/aggregator-kpis/sessions",
  }: {
    filters: SessionFilters;
    /** Route these filters navigate to. */
    basePath?: string;
  } = $props();

  function buildHref(next: Partial<SessionFilters>): string {
    const merged: SessionFilters = { ...filters, ...next };
    const params = new URLSearchParams();

    if (merged.aggregator) {
      params.set("aggregator", merged.aggregator);
    }

    if (merged.status) {
      params.set("status", merged.status);
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
    goto(
      buildHref({
        aggregator: value === "" ? null : (value as AggregatorValue),
      }),
    );
  }

  function onStatusChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    goto(
      buildHref({ status: value === "" ? null : (value as ScrapeRunStatus) }),
    );
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
    <label class="text-sm font-medium" for="status">Status</label>
    <NativeSelect.Root
      id="status"
      value={filters.status ?? ""}
      onchange={onStatusChange}
    >
      <NativeSelect.Option value="">All statuses</NativeSelect.Option>
      {#each scrapeRunStatuses as status (status)}
        <NativeSelect.Option value={status}>
          {scrapeRunStatusLabel(status)}
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
