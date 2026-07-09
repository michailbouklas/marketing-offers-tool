<script lang="ts">
  import ReasonBreakdownBars from "$lib/components/aggregator-kpis/widgets/reason-breakdown-bars.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { LostSalesByReasonRow } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    data,
  }: {
    data: LostSalesByReasonRow[];
  } = $props();

  const rows = $derived(
    data.map((row) => ({
      reason: row.reason,
      value: row.salesLoss,
      hint: `${row.storeCount} store${row.storeCount === 1 ? "" : "s"}`,
    })),
  );

  const total = $derived(data.reduce((sum, row) => sum + row.salesLoss, 0));
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Lost sales by reason</Card.Title>
    <Card.Description>
      Sales lost to cancellations across the filtered stores, grouped by reason
      (latest snapshot per store).
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <p class="text-muted-foreground text-sm">
        No lost sales attributed to a reason yet.
      </p>
    {:else}
      <ReasonBreakdownBars {rows} mode="sales" {total} />
    {/if}
  </Card.Content>
</Card.Root>
