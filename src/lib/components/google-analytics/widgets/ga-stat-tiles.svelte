<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatDurationSeconds,
    formatInteger,
    formatPercent,
    type GoogleAnalyticsTotals,
  } from "$lib/services/google-analytics/google-analytics";

  let { totals }: { totals: GoogleAnalyticsTotals } = $props();

  const tiles = $derived([
    {
      label: "Active users",
      value: formatInteger(totals.activeUsers),
      hint: `${formatInteger(totals.newUsers)} new`,
    },
    {
      label: "Sessions",
      value: formatInteger(totals.sessions),
      hint: `${formatInteger(totals.screenPageViews)} page views`,
    },
    {
      label: "Engagement rate",
      value: formatPercent(totals.engagementRate),
      hint: "Engaged sessions ÷ sessions",
    },
    {
      label: "Avg. session duration",
      value: formatDurationSeconds(totals.averageSessionDurationSeconds),
      hint: null,
    },
    {
      label: "Key events",
      value: formatInteger(totals.keyEvents),
      hint: "Conversions marked as key events",
    },
    {
      label: "Sessions per user",
      value:
        totals.activeUsers > 0
          ? (totals.sessions / totals.activeUsers).toFixed(2)
          : "—",
      hint: null,
    },
  ]);
</script>

<div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
  {#each tiles as tile (tile.label)}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Description>{tile.label}</Card.Description>
        <Card.Title class="text-3xl tabular-nums">{tile.value}</Card.Title>
        {#if tile.hint}
          <p class="text-muted-foreground text-xs">{tile.hint}</p>
        {/if}
      </Card.Header>
    </Card.Root>
  {/each}
</div>
