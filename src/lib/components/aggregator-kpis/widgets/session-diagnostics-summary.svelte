<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatNumber,
    sectionKeyLabel,
    type ManifestDiagnostics,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import SessionOutcomeBar from "./session-outcome-bar.svelte";

  let {
    diagnostics,
  }: {
    /** Parsed end-of-session diagnosis; null when not captured for this run. */
    diagnostics: ManifestDiagnostics | null;
  } = $props();

  /**
   * Composition tiles derived from the run's store-level rollup. `switchFailed`
   * is kept distinct from extraction outcomes: it means the store switch failed
   * so nothing was scraped — not a section data-quality signal.
   */
  const tiles = $derived(
    diagnostics === null
      ? []
      : [
          {
            label: "Recorded",
            value: formatNumber(diagnostics.recordedStores),
            hint: `of ${formatNumber(diagnostics.totalStores)} declared`,
          },
          {
            label: "Switch failed",
            value: formatNumber(diagnostics.switchFailedStores),
            hint: "no section scraped",
          },
          {
            label: "Retry candidates",
            value: formatNumber(diagnostics.retryCandidates),
            hint: "≥1 partial/failed section",
          },
          {
            label: "Retried",
            value: formatNumber(diagnostics.retriedStores),
            hint: "extracted more than once",
          },
        ],
  );
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Scrape health</Card.Title>
    <Card.Description>
      End-of-session per-section diagnosis: how each section broke down across
      the run's stores, and how many stores were switched, retried, or
      recovered.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-6">
    {#if diagnostics === null}
      <p class="text-muted-foreground text-sm">
        Diagnostics not captured for this session. It was finalized before
        scrape-health tracking shipped, or it scraped nothing.
      </p>
    {:else}
      <dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
        {#each tiles as tile (tile.label)}
          <div class="space-y-1">
            <dt class="text-muted-foreground text-xs tracking-wide uppercase">
              {tile.label}
            </dt>
            <dd class="text-2xl font-semibold tabular-nums">{tile.value}</dd>
            <dd class="text-muted-foreground text-xs">{tile.hint}</dd>
          </div>
        {/each}
      </dl>

      {#if diagnostics.sections.length === 0}
        <p class="text-muted-foreground text-sm">
          No per-section rollup recorded for this run.
        </p>
      {:else}
        <div class="space-y-4">
          {#each diagnostics.sections as section (section.key)}
            <div class="space-y-1.5">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-medium">
                  {sectionKeyLabel(section.key)}
                </span>
                <span class="text-muted-foreground text-xs tabular-nums">
                  {formatNumber(section.total)} stores
                </span>
              </div>
              <SessionOutcomeBar
                ok={section.status.ok}
                partial={section.status.partial}
                failed={section.status.failed}
                skipped={section.status.skipped}
                total={section.total}
              />
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
