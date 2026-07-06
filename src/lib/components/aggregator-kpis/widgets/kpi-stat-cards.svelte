<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";

  let {
    data,
  }: {
    data: { label: string; value: string; hint?: string | null }[];
  } = $props();
</script>

<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#each data as card (card.label)}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Description>{card.label}</Card.Description>
        <Card.Title class="text-3xl tabular-nums">
          {card.value}
        </Card.Title>
        {#if card.hint}
          <p class="text-muted-foreground text-xs">{card.hint}</p>
        {/if}
      </Card.Header>
    </Card.Root>
  {/each}
</div>
