<script lang="ts">
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
  import SessionOutcomeBar from "./session-outcome-bar.svelte";

  let {
    title = "Scrape sessions",
    data,
  }: {
    title?: string;
    data: ScrapeSessionRow[];
  } = $props();
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
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (row.id)}
              <Table.Row>
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
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(row.restarts)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
