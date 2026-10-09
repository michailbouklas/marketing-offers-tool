<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    forecastValidationStatusLabels,
    type ForecastValidationRunStatus,
  } from "$lib/services/forecasts/forecast-validation";

  let {
    status,
    class: className = "",
  }: { status: ForecastValidationRunStatus; class?: string } = $props();

  const variant = $derived.by(() => {
    switch (status) {
      case "evaluated":
        return "secondary" as const;
      case "failed":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  });
</script>

<Badge
  {variant}
  class="font-normal {status === 'skipped'
    ? 'text-muted-foreground'
    : ''} {className}"
>
  {forecastValidationStatusLabels[status]}
</Badge>
