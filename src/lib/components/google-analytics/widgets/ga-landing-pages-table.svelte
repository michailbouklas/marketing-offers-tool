<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatDurationSeconds,
    formatInteger,
    formatPercent,
    type GoogleAnalyticsLandingPageRow,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    rows,
    totalSessions,
  }: {
    rows: GoogleAnalyticsLandingPageRow[];
    totalSessions: number;
  } = $props();

  function share(sessions: number): string {
    return totalSessions > 0 ? formatPercent(sessions / totalSessions) : "—";
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Landing pages</Card.Title>
    <Card.Description>
      The pages sessions started on, how many visitors were new, how long they
      stayed engaged, and the key events that followed.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <p class="text-muted-foreground text-sm">No sessions in this period.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Landing page</Table.Head>
            <Table.Head class="text-right">Sessions</Table.Head>
            <Table.Head class="text-right">Share</Table.Head>
            <Table.Head class="text-right">New users</Table.Head>
            <Table.Head class="text-right">Avg. engagement</Table.Head>
            <Table.Head class="text-right">Key events</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each rows as row, position (position)}
            <Table.Row>
              <Table.Cell class="max-w-[18rem] truncate" title={row.path}>
                {row.path}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.sessions)}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {share(row.sessions)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.newUsers)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatDurationSeconds(row.avgEngagementSeconds)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.keyEvents)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
