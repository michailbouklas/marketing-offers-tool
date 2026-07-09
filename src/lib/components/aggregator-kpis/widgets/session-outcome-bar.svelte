<script lang="ts">
  import { formatNumber } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    ok,
    partial,
    failed,
    skipped,
    total = null,
  }: {
    ok: number;
    partial: number;
    failed: number;
    skipped: number;
    /** Session's declared total store count; null when unknown. */
    total?: number | null;
  } = $props();

  // Bar segments are sized against the summed outcomes (never against `total`,
  // which can lag behind the rollup), so the bar always fills exactly.
  const sum = $derived(ok + partial + failed + skipped);

  function pct(value: number): number {
    return sum > 0 ? (value / sum) * 100 : 0;
  }

  const segments = $derived([
    { key: "ok", value: ok, class: "bg-green-500", label: "OK" },
    { key: "partial", value: partial, class: "bg-amber-500", label: "Partial" },
    { key: "failed", value: failed, class: "bg-red-500", label: "Failed" },
    { key: "skipped", value: skipped, class: "bg-zinc-400", label: "Skipped" },
  ]);
</script>

<div class="flex flex-col gap-1.5">
  <div
    class="bg-muted flex h-2.5 w-full overflow-hidden rounded-full"
    role="img"
    aria-label={`${ok} ok, ${partial} partial, ${failed} failed, ${skipped} skipped`}
  >
    {#if sum > 0}
      {#each segments as segment (segment.key)}
        {#if segment.value > 0}
          <div
            class={`h-full ${segment.class}`}
            style="width: {pct(segment.value)}%"
          ></div>
        {/if}
      {/each}
    {/if}
  </div>

  <div
    class="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums"
  >
    <span class="text-green-600 dark:text-green-400">{formatNumber(ok)} ok</span
    >
    <span class="text-amber-600 dark:text-amber-400"
      >{formatNumber(partial)} partial</span
    >
    <span class="text-red-600 dark:text-red-400"
      >{formatNumber(failed)} failed</span
    >
    <span>{formatNumber(skipped)} skipped</span>
    {#if total !== null}
      <span class="text-foreground/70">of {formatNumber(total)}</span>
    {/if}
  </div>
</div>
