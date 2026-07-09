<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    classifyRetry,
    formatKpiDateTime,
    retryClassificationLabel,
    retryClassificationVariant,
    sectionStatusLabel,
    sectionStatusVariant,
    storeOutcomeLabel,
    storeOutcomeVariant,
    type StoreScrapeOutcome,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Per-store outcomes",
    data,
  }: {
    title?: string;
    data: StoreScrapeOutcome[];
  } = $props();

  type Section = StoreScrapeOutcome["sections"][number];

  /** Tooltip body for a section chip: error first, then missing fields, then retries. */
  function sectionTooltip(section: Section): string {
    const parts: string[] = [];
    if (section.error) {
      parts.push(section.error);
    }
    if (section.missingFields.length > 0) {
      parts.push(`Missing: ${section.missingFields.join(", ")}`);
    }
    if (section.attempts > 1) {
      parts.push(`Extracted ${section.attempts}× (retried)`);
    }
    return parts.join(" — ");
  }

  /** Whether a chip has anything worth a tooltip. */
  function hasDetail(section: Section): boolean {
    return (
      section.error !== null ||
      section.missingFields.length > 0 ||
      section.attempts > 1
    );
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Each store scraped in this session with its derived outcome, per-section
      status, and whether a retry recovered it. Problem stores are listed first.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No per-store results recorded for this session yet.
      </p>
    {:else}
      <Tooltip.Provider delayDuration={150}>
        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Store</Table.Head>
                <Table.Head>Outcome</Table.Head>
                <Table.Head>Retry</Table.Head>
                <Table.Head>Sections</Table.Head>
                <Table.Head class="whitespace-nowrap">Scraped</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each data as store (store.snapshotId)}
                {@const retry = classifyRetry(store.sections)}
                <Table.Row>
                  <Table.Cell class="font-medium">
                    <span class="block">
                      {store.storeName ?? "Unknown store"}
                    </span>
                    <span class="text-muted-foreground font-mono text-xs">
                      {store.slug ?? store.externalId}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      variant="outline"
                      class={storeOutcomeVariant(store.outcome)}
                    >
                      {storeOutcomeLabel(store.outcome)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {#if retryClassificationLabel(retry)}
                      <Badge
                        variant="outline"
                        class={retryClassificationVariant(retry)}
                      >
                        {retryClassificationLabel(retry)}
                      </Badge>
                    {:else}
                      <span class="text-muted-foreground text-xs">—</span>
                    {/if}
                  </Table.Cell>
                  <Table.Cell>
                    {#if store.sections.length === 0}
                      <span class="text-muted-foreground text-xs">
                        no sections
                      </span>
                    {:else}
                      <div class="flex flex-wrap gap-1">
                        {#each store.sections as section (section.key)}
                          {#if hasDetail(section)}
                            <Tooltip.Root>
                              <Tooltip.Trigger class="cursor-default">
                                <Badge
                                  variant="outline"
                                  class={sectionStatusVariant(section.status)}
                                >
                                  <span class="font-normal">{section.key}</span>
                                  <span class="opacity-70">
                                    {sectionStatusLabel(section.status)}
                                  </span>
                                  {#if section.attempts > 1}
                                    <span class="opacity-70">
                                      ↻{section.attempts}
                                    </span>
                                  {/if}
                                </Badge>
                              </Tooltip.Trigger>
                              <Tooltip.Content class="max-w-md break-words">
                                {sectionTooltip(section)}
                              </Tooltip.Content>
                            </Tooltip.Root>
                          {:else}
                            <Badge
                              variant="outline"
                              class={sectionStatusVariant(section.status)}
                            >
                              <span class="font-normal">{section.key}</span>
                              <span class="opacity-70">
                                {sectionStatusLabel(section.status)}
                              </span>
                            </Badge>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                  </Table.Cell>
                  <Table.Cell
                    class="text-muted-foreground text-sm whitespace-nowrap"
                  >
                    {formatKpiDateTime(store.scrapedAt)}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      </Tooltip.Provider>
    {/if}
  </Card.Content>
</Card.Root>
