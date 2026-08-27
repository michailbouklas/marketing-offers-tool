<script lang="ts">
  import type { ModelStroke } from "$lib/services/forecasts/forecast-types";
  import ModelSwatch from "./model-swatch.svelte";

  let {
    label,
    value,
    detail = null,
    stroke = null,
  }: {
    label: string;
    value: string;
    /** Secondary line under the value, e.g. "likely €11.9k–€14.6k". */
    detail?: string | null;
    stroke?: ModelStroke | null;
  } = $props();
</script>

<div class="flex items-start justify-between gap-3">
  <div class="text-muted-foreground flex items-center gap-1.5">
    {#if stroke}
      <ModelSwatch {stroke} class="h-2 w-5" />
    {/if}
    <span>{label}</span>
  </div>
  <div class="text-right">
    <span class="text-foreground font-medium tabular-nums">{value}</span>
    {#if detail}
      <span class="text-muted-foreground block text-[11px] tabular-nums">
        {detail}
      </span>
    {/if}
  </div>
</div>
