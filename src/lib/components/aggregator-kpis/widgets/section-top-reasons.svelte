<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    formatNumber,
    sectionKeyLabel,
    type LabeledCount,
    type ManifestDiagnostics,
    type SectionDiagnostic,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    diagnostics,
  }: {
    /** Parsed end-of-session diagnosis; null when not captured for this run. */
    diagnostics: ManifestDiagnostics | null;
  } = $props();

  /**
   * A section is worth showing only when it has ranked reasons (missing fields
   * or errors). `skipped` (store-switch failures) is deliberately excluded — it
   * is not a section data-quality signal, so this panel is about the durable
   * *why* a section was partial/failed.
   */
  const sectionsWithReasons = $derived(
    (diagnostics?.sections ?? []).filter(
      (section) =>
        section.missingFields.length > 0 || section.errors.length > 0,
    ),
  );

  const hasReasons = $derived(sectionsWithReasons.length > 0);

  /** "14 partial · 2 failed" context for a section header (omits zeros). */
  function problemContext(section: SectionDiagnostic): string {
    const parts: string[] = [];
    if (section.status.partial > 0) {
      parts.push(`${formatNumber(section.status.partial)} partial`);
    }
    if (section.status.failed > 0) {
      parts.push(`${formatNumber(section.status.failed)} failed`);
    }
    return parts.join(" · ");
  }

  type ReasonGroup = { heading: string; items: LabeledCount[] };

  /** Missing-fields then errors, skipping empty groups. */
  function reasonGroups(section: SectionDiagnostic): ReasonGroup[] {
    const groups: ReasonGroup[] = [];
    if (section.missingFields.length > 0) {
      groups.push({ heading: "Missing fields", items: section.missingFields });
    }
    if (section.errors.length > 0) {
      groups.push({ heading: "Errors", items: section.errors });
    }
    return groups;
  }
</script>

{#if hasReasons}
  <Card.Root>
    <Card.Header>
      <Card.Title>Top reasons</Card.Title>
      <Card.Description>
        Why each section was partial or failed, ranked by how many stores hit
        it. Labels are free text — hover a truncated label to see the full
        value.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-6">
      <Tooltip.Provider delayDuration={150}>
        {#each sectionsWithReasons as section (section.key)}
          <div class="space-y-3">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="text-sm font-medium">
                {sectionKeyLabel(section.key)}
              </span>
              {#if problemContext(section)}
                <span class="text-muted-foreground text-xs">
                  {problemContext(section)}
                </span>
              {/if}
            </div>

            {#each reasonGroups(section) as group (group.heading)}
              <div class="space-y-1.5">
                <p
                  class="text-muted-foreground text-xs font-medium tracking-wide uppercase"
                >
                  {group.heading}
                </p>
                <ul class="flex flex-col gap-1">
                  {#each group.items as item (item.label)}
                    <li class="flex items-center justify-between gap-3 text-sm">
                      <Tooltip.Root>
                        <Tooltip.Trigger
                          class="min-w-0 cursor-default text-left"
                        >
                          <span
                            class="text-foreground/80 block max-w-[22rem] truncate font-mono text-xs"
                          >
                            {item.label}
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Content class="max-w-md break-words">
                          <span class="font-mono">{item.label}</span>
                        </Tooltip.Content>
                      </Tooltip.Root>
                      <span class="text-muted-foreground shrink-0 tabular-nums">
                        ×{formatNumber(item.count)}
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        {/each}
      </Tooltip.Provider>
    </Card.Content>
  </Card.Root>
{/if}
