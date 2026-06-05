<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { ProcessorOfferStats } from "$lib/services/competition/competition";

  let {
    title = "Active offers by aggregator",
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: ProcessorOfferStats[];
  } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      Currently active offers per platform and how many stores run them.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">No active offers right now.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Aggregator</Table.Head>
            <Table.Head class="text-right">Active offers</Table.Head>
            <Table.Head class="text-right">Stores with offers</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data as row (row.processorId)}
            <Table.Row>
              <Table.Cell class="font-medium capitalize"
                >{row.processorName}</Table.Cell
              >
              <Table.Cell class="text-right tabular-nums"
                >{row.activeOffers}</Table.Cell
              >
              <Table.Cell class="text-right tabular-nums"
                >{row.restaurantsWithOffers}</Table.Cell
              >
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
