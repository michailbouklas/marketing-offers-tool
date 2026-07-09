<script lang="ts">
  import ReasonBreakdownBars from "$lib/components/aggregator-kpis/widgets/reason-breakdown-bars.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatMoney,
    formatNumber,
    formatPct,
    type CancellationReasonBreakdown,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    breakdown,
  }: {
    breakdown: CancellationReasonBreakdown;
  } = $props();

  let mode = $state<"count" | "sales">("count");

  const rows = $derived(
    mode === "count" ? breakdown.byCount : breakdown.bySalesLoss,
  );
  const total = $derived(
    mode === "count" ? breakdown.cancellationsCount : breakdown.lostSales,
  );

  // The headline summary always uses the authoritative snapshot columns, not a
  // sum of the reason rows.
  const summary = $derived(
    [
      breakdown.cancellationsCount !== null
        ? `${formatNumber(breakdown.cancellationsCount)} cancellations`
        : null,
      formatPct(breakdown.cancellationsPct),
      formatMoney(breakdown.lostSales),
    ]
      .filter((part) => part && part !== "—")
      .join(" · "),
  );
</script>

<Card.Root>
  <Card.Header class="gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="space-y-1">
      <Card.Title>Cancellation reasons</Card.Title>
      <Card.Description>
        {#if summary}
          {summary}
        {:else}
          Why orders were cancelled in the latest snapshot.
        {/if}
      </Card.Description>
    </div>
    <div class="flex shrink-0 gap-1">
      <Button
        variant={mode === "count" ? "default" : "outline"}
        size="sm"
        onclick={() => (mode = "count")}
      >
        Count
      </Button>
      <Button
        variant={mode === "sales" ? "default" : "outline"}
        size="sm"
        onclick={() => (mode = "sales")}
      >
        € Sales loss
      </Button>
    </div>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <p class="text-muted-foreground text-sm">
        No cancellations in this window.
      </p>
    {:else}
      <ReasonBreakdownBars {rows} {mode} {total} />
    {/if}
  </Card.Content>
</Card.Root>
