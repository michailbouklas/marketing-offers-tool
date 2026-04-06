<script lang="ts">
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import SearchIcon from "@lucide/svelte/icons/search";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import Rows3Icon from "@lucide/svelte/icons/rows-3";
  import DimOffersTable from "$lib/components/admin/dim-offers-table.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { formatBrandLabel } from "$lib/services/brands";
  import type {
    AdminDimOffersSortBy,
    AdminDimOffersSortDir,
  } from "$lib/services/admin-dim-offers";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const rows = $derived(data.dimOffersPage.items);
  const brands = $derived(data.brands);
  const page = $derived(data.dimOffersPage.page);
  const pageSize = $derived(data.dimOffersPage.pageSize);
  const totalItems = $derived(data.dimOffersPage.totalItems);
  const totalPages = $derived(data.dimOffersPage.totalPages);
  const searchQuery = $derived(data.query ?? "");

  const adminQuickLinks = $derived(
    data.userRole === "admin"
      ? [
          {
            href: "/admin/pending-submissions",
            label: "Pending submissions",
          },
          {
            href: "/admin/dim-offers",
            label: "Browse dim_offers",
          },
          {
            href: "/admin/users",
            label: "Manage users",
          },
        ]
      : [],
  );

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
    return getRouteHref({ page: targetPage });
  }

  function getRouteHref({
    page,
    brandAlias = data.selectedBrandAlias,
    query = data.query,
    sortBy = data.sortBy,
    sortDir = data.sortDir,
  }: {
    page?: number;
    brandAlias?: string | null;
    query?: string | null;
    sortBy?: AdminDimOffersSortBy;
    sortDir?: AdminDimOffersSortDir;
  }) {
    const params = new URLSearchParams();

    if (brandAlias) {
      params.set("brandAlias", brandAlias);
    }

    if (query) {
      params.set("query", query);
    }

    if (sortBy && sortBy !== "item_code") {
      params.set("sortBy", sortBy);
    }

    if (sortDir && sortDir !== "asc") {
      params.set("sortDir", sortDir);
    }

    if (page && page > 1) {
      params.set("page", page.toString());
    }

    const search = params.toString();

    return search ? `/admin/dim-offers?${search}` : "/admin/dim-offers";
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

  function getActiveBrandName() {
    if (!data.selectedBrandAlias) {
      return "All brands";
    }

    return (
      brands.find((brand) => brand.alias === data.selectedBrandAlias)?.name ??
      data.selectedBrandAlias.toUpperCase()
    );
  }

  function getSortHref(
    column: AdminDimOffersSortBy,
    nextDirection: AdminDimOffersSortDir,
  ) {
    return getRouteHref({
      page: 1,
      sortBy: column,
      sortDir: nextDirection,
    });
  }

  function getExportHref() {
    const queryString = getRouteHref({ page: undefined }).replace(
      "/admin/dim-offers",
      "",
    );

    return `/admin/dim-offers/export${queryString}`;
  }
</script>

<svelte:head>
  <title>Dim Offers | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Browse every row from dim_offers with admin-only brand filters, search, sorting, and pagination."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <span>Admin</span>
      <ChevronRightIcon class="size-3" />
      <span>Dim offers</span>
    </div>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div class="space-y-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          ClickHouse admin view
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Dim offers
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Inspect the full `dim_offers` dataset, narrow the list by brand,
            search by item, and move through the table in stable pages.
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
            <p class="text-muted-foreground mt-1 text-sm">Rows in result set</p>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Rows3Icon class="text-muted-foreground size-4" />
            <span>Showing {getActiveBrandName()}</span>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    {#if adminQuickLinks.length > 0}
      <section class="grid gap-4 lg:grid-cols-3">
        {#each adminQuickLinks as quickLink (quickLink.href)}
          <a
            href={quickLink.href}
            class="border-border/70 bg-background/85 hover:bg-background flex items-center justify-between rounded-2xl border px-5 py-4 shadow-sm backdrop-blur transition-colors"
          >
            <div>
              <p class="text-sm font-medium tracking-[-0.01em]">
                {quickLink.label}
              </p>
              <p class="text-muted-foreground mt-1 text-sm">
                {quickLink.href}
              </p>
            </div>
            <ChevronRightIcon class="text-muted-foreground size-4" />
          </a>
        {/each}
      </section>
    {/if}

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]"
              >Offer rows</Card.Title
            >
            <Card.Description>
              Showing page {page} of {totalPages} with {pageSize} rows per page.
            </Card.Description>
          </div>

          <form
            method="GET"
            bind:this={searchForm}
            class="grid gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,16rem)_auto] lg:items-end"
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
                  placeholder="Item code or description"
                  class="pl-9"
                  oninput={handleSearchInput}
                  onkeydown={handleSearchKeydown}
                />
              </div>
            </div>

            <div class="min-w-56 space-y-2">
              <label class="text-sm font-medium" for="brandAlias"
                >Brand filter</label
              >
              <div class="relative">
                <FilterIcon
                  class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <NativeSelect.Root
                  id="brandAlias"
                  name="brandAlias"
                  value={data.selectedBrandAlias ?? ""}
                  class="pl-9"
                  onchange={handleSearchChange}
                >
                  <NativeSelect.Option value="">All brands</NativeSelect.Option>
                  {#each brands as brand (brand.id)}
                    <NativeSelect.Option value={brand.alias}>
                      {formatBrandLabel(brand)}
                    </NativeSelect.Option>
                  {/each}
                </NativeSelect.Root>
              </div>
            </div>

            <input type="hidden" name="sortBy" value={data.sortBy} />
            <input type="hidden" name="sortDir" value={data.sortDir} />

            <div class="flex gap-2">
              <Button type="submit">Apply</Button>
              <Button href={getExportHref()} variant="outline">
                <DownloadIcon class="size-4" />
                Export CSV
              </Button>
              <Button href="/admin/dim-offers" variant="outline">Reset</Button>
            </div>
          </form>
        </div>
      </Card.Header>

      <Card.Content>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{getActiveBrandName()}</Badge>
          {#if searchQuery}
            <Badge variant="outline">Search: {searchQuery}</Badge>
          {/if}
          <span class="text-muted-foreground text-sm">
            {(page - 1) * pageSize + (totalItems === 0 ? 0 : 1)}-{Math.min(
              page * pageSize,
              totalItems,
            )} of {totalItems} rows
          </span>
        </div>

        <DimOffersTable
          {rows}
          {brands}
          sortBy={data.sortBy}
          sortDir={data.sortDir}
          getsorthref={getSortHref}
        />

        {#if totalItems > 0}
          <div
            class="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-muted-foreground text-sm">
              Browse the current result set without leaving the admin workspace.
            </div>

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
