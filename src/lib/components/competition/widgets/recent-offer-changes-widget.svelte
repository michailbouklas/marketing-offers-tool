<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatCompetitionDateTime,
    formatCompetitionMoney,
    type RecentOfferChange,
  } from "$lib/services/competition/competition";

  let {
    title = "Recent offer changes",
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: RecentOfferChange[];
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Latest offer status changes captured by the scraper.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">No recent changes.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>When</Table.Head>
            <Table.Head>Offer</Table.Head>
            <Table.Head>Restaurant</Table.Head>
            <Table.Head>Aggregator</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head class="text-right">Price</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data as change (`${change.offerId}-${change.effectiveAt}-${change.status}`)}
            <Table.Row>
              <Table.Cell class="text-muted-foreground whitespace-nowrap">
                {formatCompetitionDateTime(change.effectiveAt)}
              </Table.Cell>
              <Table.Cell class="max-w-64 truncate font-medium">
                {change.offerName ?? `Offer #${change.offerId}`}
              </Table.Cell>
              <Table.Cell class="max-w-48 truncate">
                {change.restaurantName ?? "—"}
              </Table.Cell>
              <Table.Cell class="capitalize">
                {change.processorName ?? "—"}
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" class="capitalize"
                  >{change.status}</Badge
                >
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatCompetitionMoney(change.resultingPrice, null)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
