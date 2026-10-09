<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    forecastValidationQualityLabels,
    type ForecastValidationQuality,
  } from "$lib/services/forecasts/forecast-validation";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleQuestionMarkIcon from "@lucide/svelte/icons/circle-question-mark";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  /**
   * Realised quality of a validation run (same tones and icons as the
   * forecast pages' confidence badge, so the two read alike).
   */
  let {
    quality,
    label,
    class: className = "",
  }: {
    quality: ForecastValidationQuality | null;
    /** Overrides the default "High / Medium / Low / Not scored" text. */
    label?: string;
    class?: string;
  } = $props();

  const toneClass = $derived.by(() => {
    switch (quality) {
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

  const text = $derived(
    label ??
      (quality ? forecastValidationQualityLabels[quality] : "Not scored"),
  );
</script>

<Badge variant="outline" class="gap-1 font-normal {toneClass} {className}">
  {#if quality === "high"}
    <CircleCheckIcon />
  {:else if quality === "medium"}
    <CircleAlertIcon />
  {:else if quality === "low"}
    <TriangleAlertIcon />
  {:else}
    <CircleQuestionMarkIcon />
  {/if}
  {text}
</Badge>
