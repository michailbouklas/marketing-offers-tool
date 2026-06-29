<script lang="ts">
  import * as Table from "$lib/components/ui/table/index.js";
  import { aggregatorLabel } from "$lib/services/urls-to-scrape-form";
  import type { UrlToScrapeRecord } from "$lib/services/urls-to-scrape.server";

  type Props = {
    urls: UrlToScrapeRecord[];
  };

  let { urls }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
</script>

<Table.Root>
  <Table.Caption class="text-muted-foreground pb-4 text-left text-sm">
    {urls.length} URL{urls.length === 1 ? "" : "s"} registered for scraping.
  </Table.Caption>
  <Table.Header>
    <Table.Row>
      <Table.Head class="w-16">ID</Table.Head>
      <Table.Head class="min-w-64">URL</Table.Head>
      <Table.Head class="w-28">Aggregator</Table.Head>
      <Table.Head class="min-w-40">Added by</Table.Head>
      <Table.Head class="w-44">Created at</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#if urls.length > 0}
      {#each urls as url (url.id)}
        <Table.Row>
          <Table.Cell class="font-medium">{url.id}</Table.Cell>
          <Table.Cell class="break-all">
            <a
              href={url.url}
              target="_blank"
              rel="noreferrer"
              class="text-primary hover:underline"
            >
              {url.url}
            </a>
          </Table.Cell>
          <Table.Cell>{aggregatorLabel(url.aggregator)}</Table.Cell>
          <Table.Cell>{url.user?.name ?? url.userId}</Table.Cell>
          <Table.Cell>{dateFormatter.format(url.created_at)}</Table.Cell>
        </Table.Row>
      {/each}
    {:else}
      <Table.Row>
        <Table.Cell colspan={5} class="text-muted-foreground text-center">
          No URLs registered yet. Use “Add New” to register one.
        </Table.Cell>
      </Table.Row>
    {/if}
  </Table.Body>
</Table.Root>
