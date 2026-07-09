<script lang="ts">
  import {
    formatNumber,
    formatSalesLoss,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";

  type BarRow = { reason: string; value: number; hint?: string | null };

  let {
    rows,
    mode = "count",
    total = null,
  }: {
    /** Pre-sorted (desc) reason rows; color is assigned by position. */
    rows: BarRow[];
    /** Whether values are cancellation counts or € sales-loss figures. */
    mode?: "count" | "sales";
    /** Authoritative headline total, used for the "% of total" label. */
    total?: number | null;
  } = $props();

  const formatValue = (value: number) =>
    mode === "sales" ? formatSalesLoss(value) : formatNumber(value);

  // Bars are ranked, so scale each to the largest value for visual comparison.
  const maxValue = $derived(
    rows.reduce((max, row) => Math.max(max, row.value), 0),
  );
</script>

<div class="space-y-3">
  {#each rows as row, index (row.reason)}
    <div class="flex items-center gap-3">
      <span class="w-40 truncate text-sm" title={row.reason}>
        {row.reason}
      </span>
      <div class="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full"
          style="width: {maxValue > 0
            ? (row.value / maxValue) * 100
            : 0}%; background-color: {reasonColor(index)}"
        ></div>
      </div>
      <span
        class="text-muted-foreground w-28 shrink-0 text-right text-sm tabular-nums"
      >
        {formatValue(row.value)}
        {#if total && total > 0}
          ({((row.value / total) * 100).toFixed(1)}%)
        {/if}
      </span>
      {#if row.hint}
        <span class="text-muted-foreground w-24 shrink-0 text-right text-xs">
          {row.hint}
        </span>
      {/if}
    </div>
  {/each}
</div>
