<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    computeDelta,
    formatDeltaLabel,
    formatDurationSeconds,
    formatInteger,
    formatPercent,
    type GoogleAnalyticsDelta,
    type GoogleAnalyticsTotals,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    totals,
    previousTotals = null,
    comparisonLabel = "vs previous period",
  }: {
    totals: GoogleAnalyticsTotals;
    /** Same metrics for the preceding period; null hides the deltas. */
    previousTotals?: GoogleAnalyticsTotals | null;
    comparisonLabel?: string;
  } = $props();

  function sessionsPerUser(value: GoogleAnalyticsTotals): number | null {
    return value.activeUsers > 0 ? value.sessions / value.activeUsers : null;
  }

  function delta(
    pick: (value: GoogleAnalyticsTotals) => number | null,
  ): GoogleAnalyticsDelta | null {
    if (!previousTotals) return null;
    const current = pick(totals);
    const previous = pick(previousTotals);
    if (current === null || previous === null) return null;
    return computeDelta(current, previous);
  }

  const tiles = $derived([
    {
      label: "Active users",
      value: formatInteger(totals.activeUsers),
      hint: `${formatInteger(totals.newUsers)} new`,
      delta: delta((value) => value.activeUsers),
    },
    {
      label: "Sessions",
      value: formatInteger(totals.sessions),
      hint: `${formatInteger(totals.screenPageViews)} page views`,
      delta: delta((value) => value.sessions),
    },
    {
      label: "Engagement rate",
      value: formatPercent(totals.engagementRate),
      hint: "Engaged sessions ÷ sessions",
      delta: delta((value) => value.engagementRate),
    },
    {
      label: "Avg. session duration",
      value: formatDurationSeconds(totals.averageSessionDurationSeconds),
      hint: null,
      delta: delta((value) => value.averageSessionDurationSeconds),
    },
    {
      label: "Key events",
      value: formatInteger(totals.keyEvents),
      hint: "Conversions marked as key events",
      delta: delta((value) => value.keyEvents),
    },
    {
      label: "Sessions per user",
      value: sessionsPerUser(totals)?.toFixed(2) ?? "—",
      hint: null,
      delta: delta(sessionsPerUser),
    },
  ]);

  // Direction is carried by the arrow glyph in the label; colour only
  // reinforces it (dataviz rule: never colour alone).
  const deltaClass: Record<GoogleAnalyticsDelta["direction"], string> = {
    up: "text-emerald-600 dark:text-emerald-400",
    down: "text-red-600 dark:text-red-400",
    flat: "text-muted-foreground",
  };
</script>

<div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
  {#each tiles as tile (tile.label)}
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Description>{tile.label}</Card.Description>
        <Card.Title class="text-3xl tabular-nums">{tile.value}</Card.Title>
        {#if tile.delta}
          <p
            class="text-xs font-medium tabular-nums {deltaClass[
              tile.delta.direction
            ]}"
            title={comparisonLabel}
          >
            {formatDeltaLabel(tile.delta)}
            <span class="text-muted-foreground font-normal">
              {comparisonLabel}
            </span>
          </p>
        {/if}
        {#if tile.hint}
          <p class="text-muted-foreground text-xs">{tile.hint}</p>
        {/if}
      </Card.Header>
    </Card.Root>
  {/each}
</div>
