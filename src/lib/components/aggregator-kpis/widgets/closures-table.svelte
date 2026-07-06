<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatDuration,
    formatKpiDateTime,
    formatPct,
    type ClosureRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Closures by store",
    data,
  }: {
    title?: string;
    data: ClosureRow[];
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Latest captured availability per store — offline time during advertised
      open hours and total unreachable time.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No closures data for the current filters.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Store</Table.Head>
              <Table.Head>Platform</Table.Head>
              <Table.Head class="text-right">Offline in open hours</Table.Head>
              <Table.Head class="text-right">Unreachable</Table.Head>
              <Table.Head class="text-right">Captured</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as row (row.storeId)}
              <Table.Row>
                <Table.Cell class="font-medium">
                  {row.storeName ?? `Store #${row.storeId}`}
                </Table.Cell>
                <Table.Cell>{aggregatorLabel(row.aggregator)}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(row.offlineOpenHoursPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatDuration(row.unreachableSeconds)}
                </Table.Cell>
                <Table.Cell
                  class="text-muted-foreground text-right whitespace-nowrap"
                >
                  {formatKpiDateTime(row.scrapedAt)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
