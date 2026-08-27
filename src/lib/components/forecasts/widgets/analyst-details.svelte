<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import {
    analystMetrics,
    analystSummaryLine,
    describeComputedAge,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastResult } from "$lib/services/forecasts/forecast-types";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  /** The one place where WAPE / MAPE / MAE are allowed to appear. */
  let { result }: { result: ForecastResult } = $props();

  let open = $state(false);

  const metrics = $derived(analystMetrics(result));
</script>

<Collapsible.Root bind:open class="rounded-lg border">
  <Collapsible.Trigger
    class="hover:bg-muted/40 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
  >
    <span>Details for analysts</span>
    <ChevronDownIcon
      class="text-muted-foreground size-4 transition-transform {open
        ? 'rotate-180'
        : ''}"
    />
  </Collapsible.Trigger>
  <Collapsible.Content class="border-t px-3 py-3">
    <p class="text-muted-foreground font-mono text-xs tabular-nums">
      {analystSummaryLine(result)}
    </p>
    <dl class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each metrics as metric (metric.label)}
        <div class="space-y-0.5">
          <dt class="text-muted-foreground text-xs">{metric.label}</dt>
          <dd class="text-sm font-medium tabular-nums">{metric.value}</dd>
          <dd class="text-muted-foreground text-xs leading-5">{metric.hint}</dd>
        </div>
      {/each}
    </dl>
    {#if result.cached}
      <p class="text-muted-foreground mt-3 text-xs">
        Served from cache — {describeComputedAge(result.generatedAt)}.
      </p>
    {/if}
  </Collapsible.Content>
</Collapsible.Root>
