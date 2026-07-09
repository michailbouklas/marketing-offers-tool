<script lang="ts">
  import { goto } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatDuration,
    formatKpiDateTime,
    formatNumber,
    scrapeRunStatusLabel,
    scrapeRunStatusVariant,
    type ScrapeSessionRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import SessionOutcomeBar from "./session-outcome-bar.svelte";
  import SessionSectionHealthDots from "./session-section-health-dots.svelte";

  let {
    title = "Scrape sessions",
    data,
  }: {
    title?: string;
    data: ScrapeSessionRow[];
  } = $props();

  /** Navigates to a session's per-store detail sub-route. */
  function openSession(sessionId: string) {
    goto(`/aggregator-kpis/sessions/${encodeURIComponent(sessionId)}`);
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Every scrape session (one supervisor invocation), newest first, with its
      outcome and per-store breakdown.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No scrape sessions for the current filters.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Session</Table.Head>
              <Table.Head>Platform</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Started</Table.Head>
              <Table.Head class="text-right">Duration</Table.Head>
              <Table.Head class="min-w-56">Stores</Table.Head>
              <Table.Head class="text-right">Restarts</Table.Head>
              <Table.Head class="w-8"
                ><span class="sr-only">View</span></Table.Head
              >
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (row.id)}
              <Table.Row
                role="link"
                tabindex={0}
                aria-label={`View per-store outcomes for session ${row.sessionId}`}
                class="hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer outline-none"
                onclick={() => openSession(row.sessionId)}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openSession(row.sessionId);
                  }
                }}
              >
                <Table.Cell class="font-medium">
                  <span class="flex items-center gap-2">
                    <span class="font-mono text-xs">{row.sessionId}</span>
                    {#if row.fresh}
                      <Badge variant="outline" class="text-xs">fresh</Badge>
                    {/if}
                  </span>
                  {#if row.shard}
                    <span class="text-muted-foreground text-xs"
                      >shard {row.shard}</span
                    >
                  {/if}
                </Table.Cell>
                <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
                <Table.Cell>
                  <Badge
                    variant="outline"
                    class={scrapeRunStatusVariant(row.status)}
                  >
                    {scrapeRunStatusLabel(row.status)}
                  </Badge>
                </Table.Cell>
                <Table.Cell class="whitespace-nowrap">
                  {formatKpiDateTime(row.startedAt)}
                </Table.Cell>
                <Table.Cell class="text-right whitespace-nowrap tabular-nums">
                  {#if row.endedAt === null}
                    <span class="text-muted-foreground">ongoing</span>
                  {:else}
                    {formatDuration(row.durationSeconds)}
                  {/if}
                </Table.Cell>
                <Table.Cell>
                  <SessionOutcomeBar
                    ok={row.okStores}
                    partial={row.partialStores}
                    failed={row.failedStores}
                    skipped={row.skippedStores}
                    total={row.totalStores}
                  />
                  <SessionSectionHealthDots diagnostics={row.diagnostics} />
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.restarts)}
                </Table.Cell>
                <Table.Cell class="text-muted-foreground w-8">
                  <ChevronRightIcon class="ml-auto size-4" />
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
