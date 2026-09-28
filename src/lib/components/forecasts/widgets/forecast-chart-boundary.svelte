<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  function onerror(error: unknown) {
    console.error("[forecasts] chart failed to render", error);
  }
</script>

<!--
  One throwing effect would otherwise abort the whole page flush and leave every
  chart stuck half-rendered. Contain it here and make the cause visible.
-->
<svelte:boundary {onerror}>
  {@render children()}

  {#snippet failed(_error, reset)}
    <div
      class="text-muted-foreground flex flex-wrap items-center gap-3 text-sm"
      role="alert"
    >
      <span>The chart could not be drawn. Reload the page.</span>
      <Button variant="outline" size="sm" onclick={reset}>Try again</Button>
    </div>
  {/snippet}
</svelte:boundary>
