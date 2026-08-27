<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    buildDayRows,
    csvFileName,
    dayRowsToCsv,
  } from "$lib/services/forecasts/forecast-chart-data";
  import {
    formatMoney,
    formatMoneyRange,
    horizonPhrase,
  } from "$lib/services/forecasts/forecast-narrative";
  import type { ForecastResult } from "$lib/services/forecasts/forecast-types";
  import DownloadIcon from "@lucide/svelte/icons/download";

  let {
    result,
    showWideBand = true,
  }: {
    result: ForecastResult;
    showWideBand?: boolean;
  } = $props();

  const rows = $derived(buildDayRows(result));

  function downloadCsv() {
    const blob = new Blob([dayRowsToCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = csvFileName(result);
    anchor.click();
    URL.revokeObjectURL(url);
  }
</script>

<Card.Root>
  <Card.Header>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <Card.Title>Day by day</Card.Title>
        <Card.Description>
          Expected sales for each of {horizonPhrase(result.horizonDays)}, with
          the range the actual figure is likely to land in.
        </Card.Description>
      </div>
      <Button variant="outline" size="sm" onclick={downloadCsv}>
        <DownloadIcon />
        Download CSV
      </Button>
    </div>
  </Card.Header>
  <Card.Content>
    <div class="max-h-[32rem] overflow-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Date</Table.Head>
            <Table.Head>Weekday</Table.Head>
            <Table.Head class="text-right">Forecast</Table.Head>
            <Table.Head class="text-right">Likely range (80 %)</Table.Head>
            {#if showWideBand}
              <Table.Head class="text-right">Wider range (95 %)</Table.Head>
            {/if}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each rows as row (row.ds)}
            <Table.Row>
              <Table.Cell class="tabular-nums">{row.label}</Table.Cell>
              <Table.Cell>
                <span class="flex items-center gap-2">
                  {row.weekday}
                  {#if row.isPeak}
                    <Badge variant="secondary" class="font-normal"
                      >Best day</Badge
                    >
                  {:else if row.isLow}
                    <Badge variant="outline" class="font-normal">Quietest</Badge
                    >
                  {/if}
                </span>
              </Table.Cell>
              <Table.Cell class="text-right font-medium tabular-nums">
                {formatMoney(row.forecast)}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {formatMoneyRange(row.lo80, row.hi80)}
              </Table.Cell>
              {#if showWideBand}
                <Table.Cell
                  class="text-muted-foreground text-right tabular-nums"
                >
                  {formatMoneyRange(row.lo95, row.hi95)}
                </Table.Cell>
              {/if}
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </Card.Content>
</Card.Root>
