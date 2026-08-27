<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    confidenceSentence,
    typicalMissPhrase,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastAccuracy } from "$lib/services/forecasts/forecast-types";
  import InfoIcon from "@lucide/svelte/icons/info";
  import ConfidenceBadge from "./confidence-badge.svelte";

  let { accuracy }: { accuracy: ForecastAccuracy | null } = $props();

  const miss = $derived(typicalMissPhrase(accuracy));
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
  <ConfidenceBadge {accuracy} />
  <span class="text-muted-foreground">
    {#if miss}
      On recent data it was {miss}.
    {:else}
      Accuracy could not be measured yet.
    {/if}
  </span>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-3"
        aria-label="How confidence is measured"
      >
        <InfoIcon class="size-4" />
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-xs text-pretty">
        {confidenceSentence(accuracy)}
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
</div>
