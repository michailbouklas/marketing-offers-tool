<script lang="ts">
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlayIcon from "@lucide/svelte/icons/play";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type {
    ScrapeQueryBrand,
    ScrapeQueryRow,
  } from "$lib/services/google-reviews-admin/places";
  import type { ScrapeRunStatus } from "$lib/services/google-reviews-admin/scrape-run";

  type Props = {
    rows: ScrapeQueryRow[];
    brands: ScrapeQueryBrand[];
    /** Status of the latest on-demand scrape per place id, if any. */
    scrapeStatus: Record<number, ScrapeRunStatus>;
    /** True while any place is being scraped (the scraper runs one at a time). */
    scrapeLocked: boolean;
    onedit: (id: number) => void;
    ondelete: (id: number) => void;
    onscrape: (id: number) => void;
  };

  let {
    rows,
    brands,
    scrapeStatus,
    scrapeLocked,
    onedit,
    ondelete,
    onscrape,
  }: Props = $props();

  const brandTitles = $derived(
    new Map(brands.map((brand) => [brand.remoteId, brand.title])),
  );

  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDateTime(value: string | null) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : dateTimeFormatter.format(date);
  }

  function brandLabel(brandId: number | null) {
    if (brandId === null) {
      return null;
    }

    return brandTitles.get(brandId) ?? `Scraper brand #${brandId}`;
  }
</script>

<Tooltip.Provider delayDuration={150}>
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head class="w-16">ID</Table.Head>
        <Table.Head class="min-w-56">Search text</Table.Head>
        <Table.Head class="w-40">Brand</Table.Head>
        <Table.Head class="w-28">Status</Table.Head>
        <Table.Head class="w-44">Last scraped</Table.Head>
        <Table.Head class="min-w-48">Notes</Table.Head>
        <Table.Head class="w-32 text-right">
          <span class="sr-only">Actions</span>
        </Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if rows.length === 0}
        <Table.Row>
          <Table.Cell
            colspan={7}
            class="text-muted-foreground py-12 text-center text-sm"
          >
            No places match the current filters.
          </Table.Cell>
        </Table.Row>
      {:else}
        {#each rows as row (row.id)}
          {@const rowRunning = scrapeStatus[row.id] === "running"}
          <Table.Row class="align-top">
            <Table.Cell class="text-muted-foreground font-mono text-xs">
              {row.id}
            </Table.Cell>
            <Table.Cell>
              <button
                type="button"
                class="text-primary text-left font-medium tracking-[-0.01em] hover:underline focus-visible:underline focus-visible:outline-none"
                onclick={() => onedit(row.id)}
              >
                {row.query}
              </button>
            </Table.Cell>
            <Table.Cell>
              {#if brandLabel(row.brandId)}
                <Badge variant="outline">{brandLabel(row.brandId)}</Badge>
              {:else}
                <span class="text-muted-foreground text-sm">-</span>
              {/if}
            </Table.Cell>
            <Table.Cell>
              {#if row.enabled}
                <Badge variant="secondary">Enabled</Badge>
              {:else}
                <Badge variant="outline" class="text-muted-foreground">
                  Disabled
                </Badge>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-sm tabular-nums">
              {#if formatDateTime(row.lastScrapedAt)}
                {formatDateTime(row.lastScrapedAt)}
              {:else}
                <span class="text-muted-foreground">Never</span>
              {/if}
            </Table.Cell>
            <Table.Cell>
              {#if row.notes && row.notes.trim().length > 0}
                <Tooltip.Root>
                  <Tooltip.Trigger
                    class="block max-w-[20rem] min-w-0 cursor-default text-left"
                  >
                    <span
                      class="text-muted-foreground block max-w-[20rem] truncate text-sm"
                    >
                      {row.notes}
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    class="max-w-md text-sm leading-6 break-words whitespace-pre-line"
                  >
                    {row.notes}
                  </Tooltip.Content>
                </Tooltip.Root>
              {:else}
                <span class="text-muted-foreground text-sm">-</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-right">
              <div class="flex justify-end gap-1">
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="size-8"
                        aria-label={rowRunning
                          ? `Show scrape progress for ${row.query}`
                          : `Scrape place ${row.query} now`}
                        disabled={scrapeLocked && !rowRunning}
                        onclick={() => onscrape(row.id)}
                      >
                        {#if rowRunning}
                          <LoaderCircleIcon
                            class="text-primary size-4 animate-spin"
                          />
                        {:else}
                          <PlayIcon class="size-4" />
                        {/if}
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    {#if rowRunning}
                      Scraping now — click to follow the log
                    {:else if scrapeLocked}
                      Another place is being scraped; wait for it to finish
                    {:else if scrapeStatus[row.id] === "failed"}
                      Last scrape failed — scrape now
                    {:else}
                      Scrape now
                    {/if}
                  </Tooltip.Content>
                </Tooltip.Root>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  aria-label={`Edit place ${row.query}`}
                  onclick={() => onedit(row.id)}
                >
                  <PencilIcon class="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="text-destructive hover:text-destructive size-8"
                  aria-label={`Delete place ${row.query}`}
                  onclick={() => ondelete(row.id)}
                >
                  <Trash2Icon class="size-4" />
                </Button>
              </div>
            </Table.Cell>
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</Tooltip.Provider>
