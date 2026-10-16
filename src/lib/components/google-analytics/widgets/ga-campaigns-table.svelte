<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInteger,
    formatPercent,
    type GoogleAnalyticsCampaignRow,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    rows,
    totalSessions,
  }: {
    rows: GoogleAnalyticsCampaignRow[];
    totalSessions: number;
  } = $props();

  function share(sessions: number): string {
    return totalSessions > 0 ? formatPercent(sessions / totalSessions) : "—";
  }

  function conversion(row: GoogleAnalyticsCampaignRow): string {
    return row.sessions > 0 ? formatPercent(row.keyEvents / row.sessions) : "—";
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Campaign performance</Card.Title>
    <Card.Description>
      Sessions by source / medium and UTM campaign, with how engaged they were
      and how many key events they produced. "(not set)" means no campaign tag
      on the link.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if rows.length === 0}
      <p class="text-muted-foreground text-sm">No sessions in this period.</p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Source / medium</Table.Head>
            <Table.Head>Campaign</Table.Head>
            <Table.Head class="text-right">Sessions</Table.Head>
            <Table.Head class="text-right">Share</Table.Head>
            <Table.Head class="text-right">Engagement</Table.Head>
            <Table.Head class="text-right">Key events</Table.Head>
            <Table.Head class="text-right">Key events / session</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each rows as row, position (position)}
            <Table.Row>
              <Table.Cell
                class="max-w-[14rem] truncate"
                title={row.sourceMedium}
              >
                {row.sourceMedium}
              </Table.Cell>
              <Table.Cell class="max-w-[16rem] truncate" title={row.campaign}>
                {row.campaign}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.sessions)}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {share(row.sessions)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatPercent(row.engagementRate)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatInteger(row.keyEvents)}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {conversion(row)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    {/if}
  </Card.Content>
</Card.Root>
