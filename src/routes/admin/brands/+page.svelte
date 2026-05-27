<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Brands | Aggregator Offers Tool</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <section class="space-y-2">
    <h1 class="text-3xl font-semibold tracking-tight">Brands</h1>
    <p class="text-muted-foreground text-sm">
      Manage brand guidelines and reference assets used by the image generator.
    </p>
  </section>

  <Card.Root>
    <Card.Header>
      <Card.Title>All brands</Card.Title>
      <Card.Description>
        Click "Manage" to upload assets or edit guidelines for a brand.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Name</Table.Head>
            <Table.Head>Slug</Table.Head>
            <Table.Head class="text-right">Asset count</Table.Head>
            <Table.Head>Active</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.brands as brand (brand.id)}
            <Table.Row>
              <Table.Cell class="font-medium">{brand.name}</Table.Cell>
              <Table.Cell>
                {#if brand.slug}
                  <code class="text-xs">{brand.slug}</code>
                {:else}
                  <span class="text-destructive text-xs">— empty —</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right">{brand.assetCount}</Table.Cell>
              <Table.Cell>{brand.active ? "Yes" : "No"}</Table.Cell>
              <Table.Cell class="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  href={`/admin/brands/${brand.id}`}
                >
                  Manage
                </Button>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell
                colspan={5}
                class="text-muted-foreground text-center text-sm"
              >
                No brands found.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</main>
