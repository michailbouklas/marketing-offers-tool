<script lang="ts">
  import {
    formatDurationDHM,
    type ClosureReasonBreakdown,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    breakdown,
  }: {
    breakdown: ClosureReasonBreakdown;
  } = $props();
</script>

{#if breakdown.reasons.length > 0}
  <p class="text-muted-foreground text-sm">
    {#each breakdown.reasons as reason, index (reason.reason)}
      {#if index > 0}
        <span class="mx-1">·</span>
      {/if}
      <span class="text-foreground font-medium">{reason.reason}</span>
      {formatDurationDHM(reason.durationSeconds, reason.durationRaw)}
    {/each}
  </p>
{/if}
