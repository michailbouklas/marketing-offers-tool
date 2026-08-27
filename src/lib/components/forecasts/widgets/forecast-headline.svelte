<script lang="ts">
  import {
    headlineParts,
    trendSentence,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastResult } from "$lib/services/forecasts/forecast-types";

  let { result }: { result: ForecastResult } = $props();

  const parts = $derived(headlineParts(result));
</script>

<div class="space-y-1">
  <p class="text-lg leading-snug text-pretty">
    {parts.prefix}
    <strong class="font-semibold tabular-nums">{parts.amount}</strong
    >{parts.suffix}
  </p>
  <p class="text-muted-foreground text-sm">{trendSentence(result)}</p>
</div>
