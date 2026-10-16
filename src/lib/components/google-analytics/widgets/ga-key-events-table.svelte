<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInteger,
    formatPercent,
    type GoogleAnalyticsKeyEventRow,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    rows,
    totalKeyEvents,
  }: {
    rows: GoogleAnalyticsKeyEventRow[];
    /** Period total from the tiles (denominator for the share column). */
    totalKeyEvents: number;
  } = $props();

  function share(count: number): string {
    return totalKeyEvents > 0 ? formatPercent(count / totalKeyEvents) : "—";
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Key events</Card.Title>
    <Card.Description>
      Which conversions fired, by event name. Only events marked as key events
      in Google Analytics are counted.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <p class="text-muted-foreground text-sm">
        No key events in this period — mark the events that matter as key events
        in GA4 Admin → Events.
      </p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Event</Table.Head>
            <Table.Head class="text-right">Key events</Table.Head>
            <Table.Head class="text-right">Share</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each rows as row, position (position)}
            <Table.Row>
              <Table.Cell class="max-w-[18rem] truncate" title={row.eventName}>
                <code class="text-xs">{row.eventName}</code>
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.keyEvents)}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {share(row.keyEvents)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
