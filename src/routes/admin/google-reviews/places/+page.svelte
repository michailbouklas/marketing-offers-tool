<script lang="ts">
  import { toast } from "svelte-sonner";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import ScrapeQueriesTable from "$lib/components/admin/google-reviews/scrape-queries-table.svelte";
  import ScrapeQueryDialog from "$lib/components/admin/google-reviews/scrape-query-dialog.svelte";
  import ScrapeRunDialog from "$lib/components/admin/google-reviews/scrape-run-dialog.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type {
    PlaceBrandSyncSummary,
    ScrapeQueryActionMessage,
    ScrapeQueryStatusFilter,
  } from "$lib/services/google-reviews-admin/places";
  import type { ScrapeRunStatus } from "$lib/services/google-reviews-admin/scrape-run";
  import { placeScrapeStream } from "$lib/state/place-scrape-stream.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  let dialogOpen = $state(false);
  let editingId = $state<number | null>(null);
  let deleteOpen = $state(false);
  let deletingId = $state<number | null>(null);
  let deleting = $state(false);
  let scrapeDialogOpen = $state(false);
  let scrapePlaceId = $state<number | null>(null);
  let syncingBrands = $state(false);

  // Seed the scrape store from SSR and re-attach to a run in progress. The
  // store is a browser-only singleton, so this is a no-op during SSR and on
  // later navigations.
  $effect(() => {
    void placeScrapeStream.init(data.scrapeRuns);
  });

  const scrapeStatus = $derived<Record<number, ScrapeRunStatus>>(
    Object.fromEntries(
      Object.values(placeScrapeStream.runs).map((run) => [
        run.placeId,
        run.status,
      ]),
    ),
  );
  const scrapeLocked = $derived(placeScrapeStream.isRunning);

  const rows = $derived(data.placesPage.items);
  const page = $derived(data.placesPage.page);
  const pageSize = $derived(data.placesPage.pageSize);
  const totalItems = $derived(data.placesPage.totalItems);
  const totalPages = $derived(data.placesPage.totalPages);
  const searchQuery = $derived(data.query ?? "");
  const status = $derived(data.status);

  const editingPlace = $derived(
    rows.find((row) => row.id === editingId) ?? null,
  );
  const deletingPlace = $derived(
    rows.find((row) => row.id === deletingId) ?? null,
  );

  const statusOptions: { value: ScrapeQueryStatusFilter; label: string }[] = [
    { value: "all", label: "All places" },
    { value: "enabled", label: "Enabled only" },
    { value: "disabled", label: "Disabled only" },
  ];

  function submitSearchForm() {
    searchForm?.requestSubmit();
  }

  function handleSearchInput() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }

    searchDebounceTimeout = setTimeout(() => {
      searchDebounceTimeout = null;
      submitSearchForm();
    }, 400);
  }

  function handleSearchChange() {
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    submitSearchForm();
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") {
      return;
    }

    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = null;
    }

    event.preventDefault();
    submitSearchForm();
  }

  function getPageHref(targetPage: number) {
    const params = new URLSearchParams();

    if (searchQuery) {
      params.set("query", searchQuery);
    }

    if (status !== "all") {
      params.set("status", status);
    }

    if (targetPage > 1) {
      params.set("page", String(targetPage));
    }

    const queryString = params.toString();
    return queryString
      ? `/admin/google-reviews/places?${queryString}`
      : "/admin/google-reviews/places";
  }

  function openCreate() {
    editingId = null;
    dialogOpen = true;
  }

  function openEdit(id: number) {
    editingId = id;
    dialogOpen = true;
  }

  function openDelete(id: number) {
    deletingId = id;
    deleteOpen = true;
  }

  async function openScrape(id: number) {
    scrapePlaceId = id;
    scrapeDialogOpen = true;

    const existing = placeScrapeStream.getRun(id);
    if (existing?.status === "running") {
      // Re-attach to the run in progress; nothing to start.
      placeScrapeStream.connect(id);
      return;
    }

    const started = await placeScrapeStream.start(id);
    if (!started && !placeScrapeStream.getRun(id)) {
      scrapeDialogOpen = false;
    }
  }

  function handleDialogMessage(message: ScrapeQueryActionMessage) {
    if (message.type === "success") {
      toast.success(message.text);
    } else {
      toast.error(message.text);
    }
  }
</script>

<svelte:head>
  <title>Places manager | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Manage the Google Maps search queries the Google Reviews scraper runs: add, edit, pause or remove places."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div class="space-y-3">
        <a
          href="/admin/google-reviews"
          class="text-muted-foreground hover:text-foreground text-sm"
        >
          &larr; Google Reviews admin
        </a>
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Scraper API
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Places manager
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Search queries the Google Reviews scraper runs against Google Maps.
            Only enabled places are scraped. Click a place to edit it. Linking a
            place to a brand assigns every business it discovers to that brand,
            so the Google Reviews brand filters work without a second assignment
            under Brands.
          </p>
        </div>
      </div>

      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Content class="grid gap-4 p-5">
          <div>
            <p class="text-3xl font-semibold tracking-[-0.04em]">
              {totalItems}
            </p>
            <p class="text-muted-foreground mt-1 text-sm">
              {totalItems === 1 ? "place" : "places"} matching
            </p>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    {#if data.loadError}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon class="size-4" />
        <Alert.Title>The scraper API could not be reached</Alert.Title>
        <Alert.Description>
          {data.loadError} Check the GOOGLE_PLACES_API setting and that the scraper
          server is up, then reload.
        </Alert.Description>
      </Alert.Root>
    {/if}

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]">Places</Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with up to {pageSize} rows per page
              ({totalItems} matching).
            </Card.Description>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form
              method="POST"
              action="?/syncBrands"
              use:enhance={() => {
                syncingBrands = true;

                return async ({ result }) => {
                  syncingBrands = false;

                  if (result.type === "success") {
                    const totals = result.data?.synced as
                      | PlaceBrandSyncSummary
                      | undefined;
                    toast.success(
                      totals
                        ? `Synced ${totals.places} ${totals.places === 1 ? "place" : "places"}: linked ${totals.assigned} ${totals.assigned === 1 ? "business" : "businesses"}` +
                            (totals.alreadyAssigned > 0
                              ? `, ${totals.alreadyAssigned} already linked`
                              : "") +
                            (totals.skippedConflicts > 0
                              ? `, ${totals.skippedConflicts} skipped (assigned to another brand)`
                              : "") +
                            (totals.unmappedPlaces > 0
                              ? `, ${totals.unmappedPlaces} with an unlinked scraper brand`
                              : "") +
                            "."
                        : "Brand links synced.",
                    );
                    await invalidateAll();
                    return;
                  }

                  if (result.type === "failure") {
                    toast.error(
                      typeof result.data?.syncError === "string"
                        ? result.data.syncError
                        : "Unable to sync brand links.",
                    );
                    return;
                  }

                  if (result.type === "error") {
                    toast.error("Unable to sync brand links.");
                  }
                };
              }}
            >
              <Tooltip.Provider delayDuration={150}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        type="submit"
                        variant="outline"
                        disabled={syncingBrands || data.loadError !== null}
                      >
                        <RefreshCwIcon
                          class={syncingBrands
                            ? "size-4 animate-spin"
                            : "size-4"}
                        />
                        {syncingBrands ? "Syncing..." : "Sync brand links"}
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content class="max-w-xs text-sm leading-5">
                    Assigns every business discovered by a place to the place's
                    brand under Brands. Businesses already assigned to another
                    brand are left alone.
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </form>
            <Button onclick={openCreate} disabled={data.loadError !== null}>
              <PlusIcon class="size-4" />
              New place
            </Button>
          </div>
        </div>

        <form
          method="GET"
          bind:this={searchForm}
          class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,14rem)] lg:items-end"
        >
          <div class="space-y-2">
            <label class="text-sm font-medium" for="query">Search</label>
            <div class="relative">
              <SearchIcon
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="query"
                name="query"
                value={searchQuery}
                placeholder="Search text or notes"
                class="pl-9"
                oninput={handleSearchInput}
                onkeydown={handleSearchKeydown}
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium" for="status">Status</label>
            <NativeSelect.Root
              id="status"
              name="status"
              value={status}
              class="w-full"
              onchange={handleSearchChange}
            >
              {#each statusOptions as option (option.value)}
                <NativeSelect.Option value={option.value}>
                  {option.label}
                </NativeSelect.Option>
              {/each}
            </NativeSelect.Root>
          </div>
        </form>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="overflow-x-auto">
          <ScrapeQueriesTable
            {rows}
            brands={data.brands}
            {scrapeStatus}
            {scrapeLocked}
            onedit={openEdit}
            ondelete={openDelete}
            onscrape={openScrape}
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <p class="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </p>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              href={getPageHref(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              href={getPageHref(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <ScrapeQueryDialog
      bind:open={dialogOpen}
      form={data.form}
      place={editingPlace}
      brands={data.brands}
      onmessage={handleDialogMessage}
    />

    <ScrapeRunDialog bind:open={scrapeDialogOpen} placeId={scrapePlaceId} />

    <AlertDialog.Root bind:open={deleteOpen}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Delete place?</AlertDialog.Title>
          <AlertDialog.Description>
            {#if deletingPlace}
              "{deletingPlace.query}" will be removed and the scraper will stop
              running this query. Businesses and reviews already scraped are
              kept.
            {:else}
              The scraper will stop running this query. Businesses and reviews
              already scraped are kept.
            {/if}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={deleting}>Cancel</AlertDialog.Cancel>
          <form
            method="POST"
            action="?/deletePlace"
            use:enhance={() => {
              deleting = true;

              return async ({ result }) => {
                deleting = false;

                if (result.type === "success") {
                  toast.success(
                    deletingPlace
                      ? `Deleted "${deletingPlace.query}".`
                      : "Place deleted.",
                  );
                  deleteOpen = false;
                  deletingId = null;
                  await invalidateAll();
                  return;
                }

                if (result.type === "failure") {
                  toast.error(
                    typeof result.data?.deleteError === "string"
                      ? result.data.deleteError
                      : "Unable to delete this place.",
                  );
                  return;
                }

                if (result.type === "error") {
                  toast.error("Unable to delete this place.");
                }
              };
            }}
          >
            <input type="hidden" name="id" value={deletingId ?? ""} />
            <Button type="submit" variant="destructive" disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </form>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </main>
</div>
