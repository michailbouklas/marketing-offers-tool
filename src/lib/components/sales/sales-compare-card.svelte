<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatSalesPct,
    salesPctTone,
    type SalesCompare,
  } from "$lib/services/sales-dashboard";
  import type { Snippet } from "svelte";

  let {
    title,
    description,
    compare,
    format,
    children,
  }: {
    title: string;
    description: string;
    compare: SalesCompare;
    format: (value: number) => string;
    /** Optional sparkline under the numbers. */
    children?: Snippet;
  } = $props();

  const toneClass = {
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    bad: "bg-red-500/15 text-red-700 dark:text-red-400",
    none: "bg-muted text-muted-foreground",
  };

  const show = (value: number | null) => (value === null ? "–" : format(value));
</script>

<Card.Root class="gap-3 py-4">
  <Card.Header class="px-4">
    <Card.Title class="text-sm">{title}</Card.Title>
    <Card.Description class="text-xs">{description}</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3 px-4">
    <div class="flex items-end justify-between gap-3">
      <div>
        <p class="text-muted-foreground text-xs">This year</p>
        <p class="text-2xl font-semibold tabular-nums">
          {show(compare.thisYear)}
        </p>
        <p class="text-muted-foreground text-xs tabular-nums">
          Last year {show(compare.lastYear)}
        </p>
      </div>
      <span
        class={`rounded-md px-2 py-1 text-sm font-semibold tabular-nums ${toneClass[salesPctTone(compare.pct)]}`}
      >
        {formatSalesPct(compare.pct)}
      </span>
    </div>
    {@render children?.()}
  </Card.Content>
</Card.Root>
