<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatDuration,
    formatKpiDateTime,
    formatNumber,
    formatPct,
    type PunctualityHistoryPoint,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Punctuality history",
    data,
  }: {
    title?: string;
    data: PunctualityHistoryPoint[];
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
      Every captured punctuality snapshot for this store — share of orders with
      avoidable waiting time, the average avoidable wait, and delivered vs.
      total orders, newest first.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No punctuality history for this store yet.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Captured</Table.Head>
              <Table.Head class="text-right">Avoidable wait orders</Table.Head>
              <Table.Head class="text-right">Avg avoidable wait</Table.Head>
              <Table.Head class="text-right">Delivered / total</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as point (point.scrapedAt)}
              <Table.Row>
                <Table.Cell class="whitespace-nowrap">
                  {formatKpiDateTime(point.scrapedAt)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(point.avoidableWaitOrdersPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatDuration(point.avgAvoidableWaitSeconds)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {ordersLabel(point.deliveredOrders, point.totalOrders)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
