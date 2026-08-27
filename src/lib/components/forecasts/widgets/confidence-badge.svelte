<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { confidenceLabel } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastAccuracy } from "$lib/services/forecasts/forecast-types";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleQuestionMarkIcon from "@lucide/svelte/icons/circle-question-mark";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  let { accuracy }: { accuracy: ForecastAccuracy | null } = $props();

  const grade = $derived(accuracy?.grade ?? null);

  // Icon + colour + wording: never colour alone.
  const toneClass = $derived.by(() => {
    switch (grade) {
      case "high":
        return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
      case "medium":
        return "border-amber-500/40 text-amber-700 dark:text-amber-300";
      case "low":
        return "border-rose-500/40 text-rose-700 dark:text-rose-300";
      default:
        return "text-muted-foreground";
    }
  });
</script>

<Badge variant="outline" class="gap-1 font-normal {toneClass}">
  {#if grade === "high"}
    <CircleCheckIcon />
  {:else if grade === "medium"}
    <CircleAlertIcon />
  {:else if grade === "low"}
    <TriangleAlertIcon />
  {:else}
    <CircleQuestionMarkIcon />
  {/if}
  {confidenceLabel(accuracy)}
</Badge>
