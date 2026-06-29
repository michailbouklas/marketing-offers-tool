<script lang="ts">
  import { toast } from "svelte-sonner";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import UrlsToScrapeForm from "$lib/components/admin/urls-to-scrape-form.svelte";
  import UrlsToScrapeBulkForm from "$lib/components/admin/urls-to-scrape-bulk-form.svelte";
  import UrlsToScrapeTable from "$lib/components/admin/urls-to-scrape-table.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let addOpen = $state(false);
  let bulkOpen = $state(false);
</script>

<svelte:head>
  <title>URLs to scrape | Aggregator Offers Tool</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <section class="flex items-start justify-between gap-4">
    <div class="space-y-2">
      <h1 class="text-3xl font-semibold tracking-tight">URLs to scrape</h1>
      <p class="text-muted-foreground text-sm">
        Register aggregator URLs that should be picked up by the scraper.
      </p>
    </div>

    <div class="flex gap-2">
      <Dialog.Root bind:open={bulkOpen}>
        <Dialog.Trigger class={buttonVariants({ variant: "outline" })}>
          Bulk Add
        </Dialog.Trigger>
        <Dialog.Content
          class="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"
        >
          <Dialog.Header>
            <Dialog.Title>Bulk add URLs to scrape</Dialog.Title>
            <Dialog.Description>
              Paste a JSON array or a newline-separated list, then review the
              detected aggregator for each URL before adding.
            </Dialog.Description>
          </Dialog.Header>

          <UrlsToScrapeBulkForm
            onSuccess={(added, skipped) => {
              bulkOpen = false;
              toast.success(
                skipped > 0
                  ? `Added ${added} URL${added === 1 ? "" : "s"}, skipped ${skipped} already registered.`
                  : `Added ${added} URL${added === 1 ? "" : "s"}.`,
              );
            }}
          />
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root bind:open={addOpen}>
        <Dialog.Trigger class={buttonVariants()}>Add New</Dialog.Trigger>
        <Dialog.Content class="sm:max-w-lg">
          <Dialog.Header>
            <Dialog.Title>Add URL to scrape</Dialog.Title>
            <Dialog.Description>
              Enter the URL and pick the aggregator it belongs to.
            </Dialog.Description>
          </Dialog.Header>

          <UrlsToScrapeForm
            form={data.createForm}
            onSuccess={(message) => {
              addOpen = false;
              toast.success(message.text);
            }}
          />
        </Dialog.Content>
      </Dialog.Root>
    </div>
  </section>

  <Card.Root>
    <Card.Content class="pt-6">
      <UrlsToScrapeTable urls={data.urls} />
    </Card.Content>
  </Card.Root>
</main>
