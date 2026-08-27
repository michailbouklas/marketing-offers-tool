<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { minHistoryBadge } from "$lib/services/forecasts/forecast-narrative";
  import type {
    ForecastModel,
    ModelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import ModelSwatch from "./model-swatch.svelte";

  let {
    model,
    stroke,
    checked,
    disabled = false,
    disabledReason = null,
    onToggle,
  }: {
    model: ForecastModel;
    stroke: ModelStroke;
    checked: boolean;
    disabled?: boolean;
    /** Shown as a tooltip when disabled (e.g. "needs 60 days"). */
    disabledReason?: string | null;
    onToggle: (checked: boolean) => void;
  } = $props();

  const uid = $props.id();
  const inputId = $derived(`forecast-model-${uid}`);
  const descriptionId = $derived(`${inputId}-description`);
</script>

{#snippet card()}
  <div
    class="flex items-start gap-3 rounded-xl border p-3 transition-colors {checked
      ? 'border-primary/40 bg-muted/40'
      : 'border-border'} {disabled ? 'opacity-60' : 'hover:bg-muted/30'}"
  >
    <Checkbox
      id={inputId}
      {checked}
      {disabled}
      onCheckedChange={(value) => onToggle(value === true)}
      aria-describedby={descriptionId}
      class="mt-0.5"
    />
    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <ModelSwatch {stroke} />
        <Label
          for={inputId}
          class="cursor-pointer text-sm font-medium {disabled
            ? 'cursor-not-allowed'
            : ''}"
        >
          {model.name}
        </Label>
        <Badge variant="outline" class="font-normal"
          >{minHistoryBadge(model)}</Badge
        >
      </div>
      {#if model.description}
        <p
          id={descriptionId}
          class="text-muted-foreground line-clamp-1 text-xs"
        >
          {model.description}
        </p>
      {/if}
    </div>
  </div>
{/snippet}

{#if disabled && disabledReason}
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <!-- Render a div (not the default button): the card already contains a checkbox button. -->
        {#snippet child({ props })}
          <div {...props} class="block w-full text-left">
            {@render card()}
          </div>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content class="max-w-xs text-pretty"
        >{disabledReason}</Tooltip.Content
      >
    </Tooltip.Root>
  </Tooltip.Provider>
{:else}
  {@render card()}
{/if}
