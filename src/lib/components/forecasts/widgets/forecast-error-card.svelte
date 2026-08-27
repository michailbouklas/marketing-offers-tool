<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    cardStatusSentence,
    forecastErrorCopy,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastModel } from "$lib/services/forecasts/forecast-types";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  let {
    model,
    code,
    message,
    onRetry,
    onRemove = null,
  }: {
    model: ForecastModel;
    code: string;
    message: string;
    onRetry: () => void;
    onRemove?: (() => void) | null;
  } = $props();

  const copy = $derived(forecastErrorCopy(code, message));
</script>

<Card.Root class="h-full">
  <Card.Content
    class="flex h-full flex-col items-center justify-center gap-3 py-14 text-center"
  >
    <div
      class="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full"
    >
      <TriangleAlertIcon class="size-5" />
    </div>
    <p class="text-lg font-medium">{copy.title}</p>
    <p class="text-muted-foreground max-w-md text-sm leading-6 text-pretty">
      {copy.message}
    </p>
    <p class="text-muted-foreground text-xs">{model.name}</p>
    <div class="mt-2 flex flex-wrap justify-center gap-2">
      <Button size="sm" onclick={onRetry}>
        <RefreshCwIcon />
        Try again
      </Button>
      {#if onRemove}
        <Button variant="outline" size="sm" onclick={onRemove}
          >Remove model</Button
        >
      {/if}
    </div>
    <p class="sr-only">{cardStatusSentence(model.name, "error")}</p>
  </Card.Content>
</Card.Root>
