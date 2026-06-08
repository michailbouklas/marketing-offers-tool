<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatRating,
    type GoogleReviewsDashboardStats,
  } from "$lib/services/google-reviews/google-reviews";

  let {
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: GoogleReviewsDashboardStats["totals"];
  } = $props();

  const numberFormatter = new Intl.NumberFormat();

  const cards = $derived([
    { label: "Businesses", value: numberFormatter.format(data.businesses) },
    { label: "Reviews", value: numberFormatter.format(data.reviews) },
    { label: "Avg Rating", value: formatRating(data.averageRating) },
    {
      label: "Negative Reviews",
      value: numberFormatter.format(data.negativeCount),
      hint:
        data.negativePercentage !== null
          ? `${data.negativePercentage.toFixed(1)}% of analyzed`
          : null,
    },
  ]);
</script>

<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#each cards as card (card.label)}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Description>{card.label}</Card.Description>
        <Card.Title class="text-3xl tabular-nums">
          {card.value}
        </Card.Title>
        {#if "hint" in card && card.hint}
          <p class="text-muted-foreground text-xs">{card.hint}</p>
        {/if}
      </Card.Header>
    </Card.Root>
  {/each}
</div>
