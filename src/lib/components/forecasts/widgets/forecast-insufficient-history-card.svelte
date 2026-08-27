<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { insufficientHistorySentence } from "$lib/services/forecasts/forecast-narrative";
  import ForecastEmptyState from "./forecast-empty-state.svelte";

  let {
    brandName,
    modelName,
    historyDays,
    minHistoryDays,
    message = null,
    onRemove = null,
  }: {
    brandName: string;
    modelName: string;
    /** Days of usable history the brand has; null when unknown. */
    historyDays: number | null;
    minHistoryDays: number;
    /** Server-provided sentence (already friendly) overrides the generated one. */
    message?: string | null;
    onRemove?: (() => void) | null;
  } = $props();

  const text = $derived(
    message ??
      insufficientHistorySentence({
        brandName,
        modelName,
        historyDays,
        minHistoryDays,
      }),
  );
</script>

<ForecastEmptyState title="Not enough sales history yet" message={text}>
  {#if onRemove}
    <Button variant="outline" size="sm" onclick={onRemove}>Remove model</Button>
  {/if}
</ForecastEmptyState>
