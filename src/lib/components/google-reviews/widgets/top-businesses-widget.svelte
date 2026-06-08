<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatRating,
    type TopBusinessRow,
  } from "$lib/services/google-reviews/google-reviews";

  let {
    title = "Top businesses by rating",
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: TopBusinessRow[];
  } = $props();

  const numberFormatter = new Intl.NumberFormat();
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      The highest-rated businesses across all captured reviews.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if data.length === 0}
      <p class="text-muted-foreground text-sm">No rated businesses yet.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Business</Table.Head>
            <Table.Head class="text-right">Avg rating</Table.Head>
            <Table.Head class="text-right">Reviews</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data as row (row.cid)}
            <Table.Row>
              <Table.Cell class="max-w-72">
                <a
                  href={`/google-reviews/businesses/${row.cid}`}
                  class="block truncate font-medium hover:underline"
                >
                  {row.title}
                </a>
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatRating(row.averageRating)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {numberFormatter.format(row.reviewCount)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
