<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import type { DashboardStats } from "$lib/services/competition/competition";

  let {
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: DashboardStats["totals"];
  } = $props();

  const numberFormatter = new Intl.NumberFormat();

  const cards = $derived([
    { label: "Restaurants", value: data.restaurants },
    { label: "Products", value: data.products },
    { label: "Offers", value: data.offers },
    { label: "Active Offers", value: data.activeOffers },
  ]);
</script>

<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
  {#each cards as card (card.label)}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Description>{card.label}</Card.Description>
        <Card.Title class="text-3xl tabular-nums">
          {numberFormatter.format(card.value)}
        </Card.Title>
      </Card.Header>
    </Card.Root>
  {/each}
</div>
