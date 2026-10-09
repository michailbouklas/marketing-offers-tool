<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import type { Snippet } from "svelte";

  let {
    label,
    value,
    hint = null,
    children,
  }: {
    label: string;
    value: string;
    hint?: string | null;
    /** Optional extra content under the value (badges, counts). */
    children?: Snippet;
  } = $props();
</script>

<Card.Root class="gap-1 py-4">
  <Card.Content class="space-y-1 px-4">
    <p class="text-muted-foreground text-xs tracking-[0.14em] uppercase">
      {label}
    </p>
    <p class="text-2xl font-semibold tracking-[-0.03em] tabular-nums">
      {value}
    </p>
    {#if hint}
      <p class="text-muted-foreground text-xs leading-5">{hint}</p>
    {/if}
    {#if children}
      <div class="pt-1">{@render children()}</div>
    {/if}
  </Card.Content>
</Card.Root>
