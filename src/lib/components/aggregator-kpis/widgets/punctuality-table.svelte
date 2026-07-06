<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    aggregatorLabel,
    formatDuration,
    formatKpiDateTime,
    formatNumber,
    formatPct,
    type PunctualityRow,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Punctuality by store",
    data,
  }: {
    title?: string;
    data: PunctualityRow[];
  } = $props();

  function ordersLabel(delivered: number | null, total: number | null): string {
    if (delivered === null && total === null) {
      return "—";
    }

    return `${formatNumber(delivered)} / ${formatNumber(total)}`;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Latest captured share of orders with avoidable waiting time, the average
      avoidable wait, and delivered vs. total orders per store.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No punctuality data for the current filters.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Store</Table.Head>
              <Table.Head>Platform</Table.Head>
              <Table.Head class="text-right">Avoidable wait orders</Table.Head>
              <Table.Head class="text-right">Avg avoidable wait</Table.Head>
              <Table.Head class="text-right">Delivered / total</Table.Head>
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
                  {formatPct(row.avoidableWaitOrdersPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatDuration(row.avgAvoidableWaitSeconds)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {ordersLabel(row.deliveredOrders, row.totalOrders)}
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
