<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";

  /** Placeholder mirroring the dashboard layout while Google answers. */
  let { propertyName }: { propertyName: string } = $props();
</script>

{#snippet tableSkeleton(rows: number)}
  <Card.Root>
    <Card.Header class="space-y-2">
      <Skeleton class="h-5 w-32" />
      <Skeleton class="h-4 w-1/2" />
    </Card.Header>
    <Card.Content class="space-y-3">
      {#each { length: rows } as _, row (row)}
        <div class="flex items-center gap-4">
          <Skeleton class="h-4 flex-1" />
          <Skeleton class="h-4 w-12" />
          <Skeleton class="h-4 w-12" />
          <Skeleton class="h-4 w-12" />
        </div>
      {/each}
    </Card.Content>
  </Card.Root>
{/snippet}

<div class="space-y-6" aria-busy="true">
  <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
    {#each { length: 6 } as _, index (index)}
      <Card.Root>
        <Card.Header class="space-y-2 pb-2">
          <Skeleton class="h-3 w-20" />
          <Skeleton class="h-8 w-24" />
          <Skeleton class="h-3 w-16" />
        </Card.Header>
      </Card.Root>
    {/each}
  </div>

  <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <Card.Root>
      <Card.Header class="space-y-2">
        <Skeleton class="h-5 w-28" />
        <Skeleton class="h-4 w-2/3" />
      </Card.Header>
      <Card.Content>
        <Skeleton class="h-64 w-full rounded-xl" />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header class="space-y-2 pb-2">
        <Skeleton class="h-3 w-32" />
        <Skeleton class="h-9 w-24" />
      </Card.Header>
      <Card.Content class="space-y-3">
        <Skeleton class="h-20 w-full rounded-xl" />
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Acquisition -->
  <Skeleton class="h-4 w-24" />
  <div class="grid gap-6 lg:grid-cols-2">
    {@render tableSkeleton(5)}
    {@render tableSkeleton(5)}
  </div>
  {@render tableSkeleton(6)}

  <!-- Behaviour -->
  <Skeleton class="h-4 w-24" />
  <Card.Root>
    <Card.Header class="space-y-2">
      <Skeleton class="h-5 w-36" />
      <Skeleton class="h-4 w-2/3" />
    </Card.Header>
    <Card.Content>
      <Skeleton class="h-44 w-full rounded-xl" />
    </Card.Content>
  </Card.Root>
  <div class="grid gap-6 lg:grid-cols-2">
    {@render tableSkeleton(5)}
    {@render tableSkeleton(5)}
  </div>

  <!-- Audience -->
  <Skeleton class="h-4 w-24" />
  <div class="grid gap-6 lg:grid-cols-2">
    <Card.Root>
      <Card.Header class="space-y-2">
        <Skeleton class="h-5 w-32" />
        <Skeleton class="h-4 w-1/2" />
      </Card.Header>
      <Card.Content class="flex items-center gap-6">
        <Skeleton class="size-36 shrink-0 rounded-full" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-5/6" />
        </div>
      </Card.Content>
    </Card.Root>
    {@render tableSkeleton(3)}
    {@render tableSkeleton(5)}
    {@render tableSkeleton(5)}
  </div>

  <p class="sr-only">Loading Google Analytics data for {propertyName}…</p>
</div>
