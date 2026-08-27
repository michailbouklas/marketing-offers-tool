<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { cardStatusSentence } from "$lib/services/forecasts/forecast-narrative";

  let { modelName }: { modelName: string } = $props();
</script>

<Card.Root class="h-full" aria-busy="true">
  <Card.Header>
    <div class="flex items-center gap-2">
      <Skeleton class="h-3 w-7" />
      <Skeleton class="h-5 w-36" />
      <Skeleton class="h-5 w-24 rounded-full" />
    </div>
    <Skeleton class="mt-2 h-4 w-3/4" />
  </Card.Header>
  <Card.Content class="space-y-5">
    <div class="space-y-2">
      <Skeleton class="h-6 w-full" />
      <Skeleton class="h-4 w-1/2" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      {#each { length: 4 } as _, index (index)}
        <Skeleton class="h-24 rounded-xl" />
      {/each}
    </div>
    <Skeleton class="h-64 w-full rounded-xl" />
    <Skeleton class="h-5 w-2/3" />
    <p class="sr-only">{cardStatusSentence(modelName, "loading")}</p>
  </Card.Content>
</Card.Root>
