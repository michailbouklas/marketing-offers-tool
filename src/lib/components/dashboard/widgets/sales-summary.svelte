<script lang="ts">
  import type { SalesWidgetData } from "$lib/dashboard/widgets";
  import {
    formatSalesAmount,
    formatSalesCount,
    formatSalesPct,
    salesPctTone,
    type SalesCompare,
  } from "$lib/services/sales-dashboard";
  import PeriodCaption from "./period-caption.svelte";

  let { data }: { data: SalesWidgetData } = $props();

  const toneClass = {
    good: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    bad: "text-red-700 dark:text-red-400",
    none: "text-muted-foreground",
  };

  const rows: {
    label: string;
    compare: SalesCompare;
    format: (v: number) => string;
  }[] = $derived([
    { label: "Net sales", compare: data.range.net, format: formatSalesAmount },
    {
      label: "Transactions",
      compare: data.range.txns,
      format: formatSalesCount,
    },
    { label: "Avg ticket", compare: data.range.atv, format: formatSalesAmount },
  ]);
</script>

<PeriodCaption {data} />
<table class="w-full text-sm">
  <thead class="text-muted-foreground text-xs">
    <tr>
      <th class="text-left font-normal"></th>
      <th class="text-right font-normal">This year</th>
      <th class="text-right font-normal">Last year</th>
      <th class="text-right font-normal">Δ</th>
    </tr>
  </thead>
  <tbody class="tabular-nums">
    {#each rows as row (row.label)}
      <tr>
        <td class="py-1">{row.label}</td>
        <td class="text-right font-semibold">
          {row.compare.thisYear === null
            ? "–"
            : row.format(row.compare.thisYear)}
        </td>
        <td class="text-muted-foreground text-right">
          {row.compare.lastYear === null
            ? "–"
            : row.format(row.compare.lastYear)}
        </td>
        <td class={`text-right ${toneClass[salesPctTone(row.compare.pct)]}`}>
          {formatSalesPct(row.compare.pct)}
        </td>
      </tr>
    {/each}
  </tbody>
</table>
