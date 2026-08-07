<script lang="ts">
  import StoreBrandAssignmentTable from "$lib/components/admin/store-brand-assignment-table.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    aggregatorLabel,
    aggregators,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 p-6">
  <div class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold">Store → brand assignments</h1>
    <p class="text-muted-foreground text-sm">
      A restaurant is scraped separately on each platform — "KFC Paphos" on
      Foody and on Wolt are unrelated records. Group them under one brand so the
      aggregator KPI pages can report per brand across platforms. A store
      belongs to at most one brand, so assigning one that is already grouped
      moves it.
    </p>
  </div>

  <Card.Root>
    <Card.Header class="flex flex-row items-center justify-between gap-4">
      <Card.Title>{aggregatorLabel(data.aggregator)} stores</Card.Title>
      <ButtonGroup.Root>
        {#each aggregators as aggregator (aggregator)}
          <Button
            variant={data.aggregator === aggregator ? "default" : "outline"}
            href={`/admin/brand-assignments?aggregator=${aggregator}`}
          >
            {aggregatorLabel(aggregator)}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </Card.Header>
    <Card.Content>
      <StoreBrandAssignmentTable rows={data.rows} brands={data.brands} />
    </Card.Content>
  </Card.Root>
</div>
