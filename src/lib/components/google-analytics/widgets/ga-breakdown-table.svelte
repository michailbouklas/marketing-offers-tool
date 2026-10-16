<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInteger,
    formatPercent,
    type GoogleAnalyticsBreakdownRow,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    title,
    description,
    labelHeader,
    rows,
    totalSessions,
  }: {
    title: string;
    description: string;
    labelHeader: string;
    rows: GoogleAnalyticsBreakdownRow[];
    /** Denominator for the share column (period total, not the top-10 sum). */
    totalSessions: number;
  } = $props();

  function share(row: GoogleAnalyticsBreakdownRow): string {
    return totalSessions > 0
      ? formatPercent(row.sessions / totalSessions)
      : "—";
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <p class="text-muted-foreground text-sm">No data for this period.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{labelHeader}</Table.Head>
            <Table.Head class="text-right">Sessions</Table.Head>
            <Table.Head class="text-right">Share</Table.Head>
            <Table.Head class="text-right">Active users</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each rows as row (row.label)}
            <Table.Row>
              <Table.Cell class="max-w-[18rem] truncate" title={row.label}>
                {row.label}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.sessions)}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {share(row)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.activeUsers)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
