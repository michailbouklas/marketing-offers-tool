<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import {
    formatPortalDelta,
    type PortalDelta,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let { delta }: { delta: PortalDelta | null | undefined } = $props();

  // Display-only (handoff §3): the portal's own signed change vs its chosen
  // window. Rendered neutrally — for closures/rejections a rise is "bad", so we
  // don't colour by sign and risk implying the opposite.
  const text = $derived(formatPortalDelta(delta));
</script>

{#if text}
  <Badge
    variant="outline"
    class="text-muted-foreground text-[0.65rem] font-normal tabular-nums"
  >
    {text}
  </Badge>
{/if}
