<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatCompetitionDateTime } from "$lib/services/competition/competition";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const rows = $derived(data.sessionsPage.items);
  const page = $derived(data.sessionsPage.page);
  const pageSize = $derived(data.sessionsPage.pageSize);
  const totalItems = $derived(data.sessionsPage.totalItems);
  const totalPages = $derived(data.sessionsPage.totalPages);

  function getPageHref(targetPage: number) {
    const params = new URLSearchParams();

    if (targetPage > 1) {
      params.set("page", targetPage.toString());
    }

    const search = params.toString();

    return search
      ? `/competition/offers/scrape-sessions?${search}`
      : "/competition/offers/scrape-sessions";
  }

  function getVisiblePages() {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);

    return Array.from(
      { length: end - adjustedStart + 1 },
      (_, index) => adjustedStart + index,
    );
  }

  function getStatusVariant(status: string) {
    const normalizedStatus = status.trim().toLowerCase();

    if (
      ["success", "succeeded", "completed", "ok"].includes(normalizedStatus)
    ) {
      return "default";
    }

    if (["failed", "failure", "error"].includes(normalizedStatus)) {
      return "destructive";
    }

    return "secondary";
  }

  function formatDuration(durationMs: number | null) {
    if (durationMs === null) {
      return "—";
    }

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }

    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  function formatCount(value: number) {
    return new Intl.NumberFormat().format(value);
  }
</script>

<svelte:head>
  <title>Scrape Sessions | Active Offers | Competition</title>
  <meta
    name="description"
    content="Super user audit view for competition scraper sessions captured in ClickHouse."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-5)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a href="/competition" class="hover:text-foreground transition-colors"
        >Competition</a
      >
      <ChevronRightIcon class="size-3" />
      <a
        href="/competition/offers"
        class="hover:text-foreground transition-colors">Active offers</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Scrape sessions</span>
    </div>

    <section
      class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
    >
      <div class="space-y-2">
        <Badge variant="outline">Super user</Badge>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Scrape sessions
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Audit the latest scraper runs, status signals, captured item counts,
          and source artifacts backing Competition active offers.
        </p>
      </div>

      <Button href="/competition/offers" variant="outline"
        >Back to offers</Button
      >
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]">
              Sessions
            </Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page, newest
              scrape first.
            </Card.Description>
          </div>
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} sessions
          </span>
        </div>
      </Card.Header>

      <Card.Content>
        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Scraped</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Aggregator</Table.Head>
                <Table.Head>Restaurant</Table.Head>
                <Table.Head>Captured</Table.Head>
                <Table.Head>Duration</Table.Head>
                <Table.Head>Source</Table.Head>
                <Table.Head>Artifacts / error</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if rows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={8}
                    class="text-muted-foreground py-8 text-center"
                  >
                    No scrape sessions have been captured yet.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each rows as row (row.id)}
                  <Table.Row>
                    <Table.Cell class="whitespace-nowrap">
                      <p class="font-medium">
                        {formatCompetitionDateTime(row.scrapedAt)}
                      </p>
                      <p class="text-muted-foreground text-xs">
                        Session #{row.id}
                      </p>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge
                        variant={getStatusVariant(row.status)}
                        class="capitalize"
                      >
                        {row.status || "unknown"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell class="max-w-40">
                      <p class="truncate capitalize">
                        {row.aggregatorName ??
                          `Aggregator #${row.aggregatorId}`}
                      </p>
                      <p class="text-muted-foreground text-xs uppercase">
                        {row.language || "—"}
                      </p>
                    </Table.Cell>
                    <Table.Cell class="max-w-48">
                      <p class="truncate">
                        {row.restaurantName ??
                          (row.restaurantId
                            ? `Restaurant #${row.restaurantId}`
                            : "—")}
                      </p>
                    </Table.Cell>
                    <Table.Cell class="whitespace-nowrap tabular-nums">
                      <div class="flex flex-col gap-1 text-sm">
                        <span>{formatCount(row.offerCount)} offers</span>
                        <span class="text-muted-foreground">
                          {formatCount(row.itemCount)} items · {formatCount(
                            row.categoryCount,
                          )} categories
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell class="whitespace-nowrap tabular-nums">
                      {formatDuration(row.durationMs)}
                    </Table.Cell>
                    <Table.Cell class="max-w-72">
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={row.sourceUrl}
                        class="text-primary block truncate text-sm hover:underline"
                      >
                        {row.sourceUrl}
                      </a>
                    </Table.Cell>
                    <Table.Cell class="max-w-80">
                      <div class="space-y-1 text-xs">
                        {#if row.markdownPath}
                          <p class="truncate" title={row.markdownPath}>
                            Markdown: {row.markdownPath}
                          </p>
                        {/if}
                        {#if row.jsonPath}
                          <p class="truncate" title={row.jsonPath}>
                            JSON: {row.jsonPath}
                          </p>
                        {/if}
                        {#if row.errorMessage}
                          <p
                            class="text-destructive truncate"
                            title={row.errorMessage}
                          >
                            {row.errorMessage}
                          </p>
                        {/if}
                        {#if !row.markdownPath && !row.jsonPath && !row.errorMessage}
                          <span class="text-muted-foreground">—</span>
                        {/if}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        </div>

        {#if totalItems > 0}
          <div
            class="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end"
          >
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                href={getPageHref(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>

              {#each getVisiblePages() as visiblePage (visiblePage)}
                <Button
                  href={getPageHref(visiblePage)}
                  variant={visiblePage === page ? "default" : "outline"}
                  size="sm"
                >
                  {visiblePage}
                </Button>
              {/each}

              <Button
                variant="outline"
                href={getPageHref(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </main>
</div>
