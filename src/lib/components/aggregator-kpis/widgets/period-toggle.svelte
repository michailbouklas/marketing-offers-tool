<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import {
    periodKindLabel,
    periodKinds,
    type PeriodKind,
  } from "$lib/services/aggregator-kpis/aggregator-kpis";

  let {
    period,
    basePath,
  }: {
    period: PeriodKind;
    /** Page path the toggle links to, e.g. "/aggregator-kpis/closures/12". */
    basePath: string;
  } = $props();

  function href(kind: PeriodKind): string {
    return kind === "week" ? basePath : `${basePath}?period=${kind}`;
  }
</script>

<div class="space-y-2">
  <span class="text-sm font-medium">Period</span>
  <ButtonGroup.Root>
    {#each periodKinds as kind (kind)}
      <Button
        href={href(kind)}
        variant={period === kind ? "default" : "outline"}
      >
        {periodKindLabel(kind)}
      </Button>
    {/each}
  </ButtonGroup.Root>
</div>
