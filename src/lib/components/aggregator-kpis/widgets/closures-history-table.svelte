<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatDuration,
    formatKpiDateTime,
    formatPct,
    type ClosureHistoryPoint,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Closures history",
    data,
  }: {
    title?: string;
    data: ClosureHistoryPoint[];
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Every captured availability snapshot for this store — offline time during
      advertised open hours and total unreachable time, newest first.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No closures history for this store yet.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Captured</Table.Head>
              <Table.Head class="text-right">Offline in open hours</Table.Head>
              <Table.Head class="text-right">Unreachable</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as point (point.scrapedAt)}
              <Table.Row>
                <Table.Cell class="whitespace-nowrap">
                  {formatKpiDateTime(point.scrapedAt)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(point.offlineOpenHoursPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatDuration(point.unreachableSeconds)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
