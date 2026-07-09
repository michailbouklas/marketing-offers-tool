<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    formatNumber,
    sectionKeyLabel,
    sectionTallyTone,
    type ManifestDiagnostics,
    type StoreOutcome,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    diagnostics,
  }: {
    /** Parsed diagnosis; renders nothing when null (caller shows the fallback). */
    diagnostics: ManifestDiagnostics | null;
  } = $props();

  const sections = $derived(diagnostics?.sections ?? []);

  /** Solid dot colour per tone, matching the SessionOutcomeBar palette. */
  const toneClass: Record<StoreOutcome, string> = {
    ok: "bg-green-500",
    partial: "bg-amber-500",
    failed: "bg-red-500",
    skipped: "bg-zinc-400",
  };

  /** Full per-section breakdown for the dot tooltip. */
  function tooltip(section: ManifestDiagnostics["sections"][number]): string {
    const { ok, partial, failed, skipped } = section.status;
    return `${sectionKeyLabel(section.key)}: ${formatNumber(ok)} ok · ${formatNumber(partial)} partial · ${formatNumber(failed)} failed · ${formatNumber(skipped)} skipped`;
  }
</script>

{#if sections.length > 0}
  <Tooltip.Provider delayDuration={150}>
    <div class="mt-1.5 flex items-center gap-1">
      {#each sections as section (section.key)}
        <Tooltip.Root>
          <Tooltip.Trigger class="cursor-default">
            <span
              class={`inline-block size-2.5 rounded-full ${toneClass[sectionTallyTone(section.status)]}`}
              aria-label={tooltip(section)}
            ></span>
          </Tooltip.Trigger>
          <Tooltip.Content class="max-w-xs break-words">
            {tooltip(section)}
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
  </Tooltip.Provider>
{/if}
