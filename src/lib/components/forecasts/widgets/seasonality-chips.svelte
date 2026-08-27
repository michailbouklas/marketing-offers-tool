<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { seasonalityChips } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastSeasonality } from "$lib/services/forecasts/forecast-types";

  let {
    seasonality,
    max = 4,
  }: {
    seasonality: ForecastSeasonality;
    /** Chips shown before the "+N more" toggle. */
    max?: number;
  } = $props();

  let expanded = $state(false);

  const chips = $derived(seasonalityChips(seasonality));
  const visible = $derived(expanded ? chips : chips.slice(0, max));
  const hidden = $derived(chips.length - visible.length);
</script>

{#if chips.length > 0}
  <ul
    class="flex flex-wrap items-center gap-1.5"
    aria-label="Patterns the model found"
  >
    {#each visible as chip (chip.label)}
      <li>
        <Badge
          variant={chip.tone === "holiday" ? "secondary" : "outline"}
          class="font-normal"
        >
          {chip.label}
        </Badge>
      </li>
    {/each}
    {#if hidden > 0}
      <li>
        <Button
          variant="link"
          size="xs"
          class="text-muted-foreground"
          onclick={() => (expanded = true)}
        >
          +{hidden} more
        </Button>
      </li>
    {:else if expanded && chips.length > max}
      <li>
        <Button
          variant="link"
          size="xs"
          class="text-muted-foreground"
          onclick={() => (expanded = false)}
        >
          Show less
        </Button>
      </li>
    {/if}
  </ul>
{/if}
