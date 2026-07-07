<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatKpiDateTime,
    formatMoney,
    formatNumber,
    formatPct,
    type RejectionHistoryPoint,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    title = "Order rejections history",
    data,
  }: {
    title?: string;
    data: RejectionHistoryPoint[];
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Every captured order-rejections snapshot for this store — cancellation
      rate, lost sales, and orders rejected for unknown reasons, newest first.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">
        No order-rejections history for this store yet.
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Captured</Table.Head>
              <Table.Head class="text-right">Cancellations</Table.Head>
              <Table.Head class="text-right">Lost sales</Table.Head>
              <Table.Head class="text-right">Reason unknown</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data as point (point.scrapedAt)}
              <Table.Row>
                <Table.Cell class="whitespace-nowrap">
                  {formatKpiDateTime(point.scrapedAt)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatPct(point.cancellationsPct)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatMoney(point.lostSales)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatNumber(point.reasonUnknownCount)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
