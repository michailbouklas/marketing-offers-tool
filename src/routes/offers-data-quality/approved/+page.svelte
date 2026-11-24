<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { page as pageState } from "$app/state";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import MultiSelectFilter from "$lib/components/sales/multi-select-filter.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let isExporting = $state(false);
  let search = $state("");
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    search = data.filters.search ?? "";
  });
  $effect(() => () => clearTimeout(searchTimer));

  const brandOptions = $derived(
    data.brands.map((brand) => ({ value: brand.alias, label: brand.name })),
  );
  const isAllBrands = $derived(
    data.selectedBrandAliases.length === data.brands.length,
  );

  /** Rewrites the URL filters; any filter change goes back to page 1. */
  function navigate(change: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(pageState.url.searchParams);
    params.delete("page");
    change(params);
    goto(`?${params}`, { keepFocus: true, noScroll: true });
  }

  function setParam(params: URLSearchParams, key: string, value?: string) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  function applyBrands(values: string[]) {
    navigate((params) => {
      params.delete("brandAlias");
      for (const alias of values) params.append("brandAlias", alias);
    });
  }

  function applyRange(range: { from?: string; to?: string }) {
    navigate((params) => {
      setParam(params, "from", range.from);
      setParam(params, "to", range.to);
    });
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () => navigate((params) => setParam(params, "q", search.trim())),
      500,
    );
  }

  function goToPage(target: number) {
    navigate((params) => setParam(params, "page", String(target)));
  }

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleDateString() : "—";
  }

  async function exportExcel() {
    isExporting = true;
    try {
      const response = await fetch(
        `/offers-data-quality/approved/export${pageState.url.search}`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch {
      toast.error("The Excel export could not be generated. Try again.");
    } finally {
      isExporting = false;
    }
  }
</script>

<svelte:head>
  <title>Approved offers | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Offer pricing submissions that have been approved, with Excel export."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a href="/offers-data-quality" class="hover:text-foreground">Gap list</a>
      <ChevronRightIcon class="size-3" />
      <span>Approved offers</span>
    </div>

    <div class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Approved offers
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        Every pricing submission that was approved, newest first. This is the
        approval history: an offer approved twice appears twice, and later edits
        made elsewhere are not shown.
      </p>
    </div>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header
        class="flex flex-row flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Card.Title class="text-2xl tracking-[-0.03em]">
            {data.totalItems} approved
          </Card.Title>
          <Card.Description>Limited to your assigned brands.</Card.Description>
        </div>
        <div class="flex items-center gap-2">
          <Button href="/offers-data-quality" variant="outline" size="sm">
            <ArrowLeftIcon class="size-4" />
            Back to queue
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting || data.totalItems === 0}
            onclick={exportExcel}
          >
            {#if isExporting}
              <LoaderCircleIcon class="size-4 animate-spin" />
            {:else}
              <DownloadIcon class="size-4" />
            {/if}
            Export to Excel
          </Button>
        </div>
      </Card.Header>
      <Card.Content>
        <div
          class="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-dashed px-4 py-4 sm:px-5"
        >
          <MultiSelectFilter
            label="Brand"
            noun="brands"
            options={brandOptions}
            selected={isAllBrands ? [] : data.selectedBrandAliases}
            onApply={applyBrands}
          />
          <div class="space-y-2">
            <span class="text-sm font-medium">Approved</span>
            <DateRangeFilter
              from={data.filters.from}
              to={data.filters.to}
              onApply={applyRange}
            />
          </div>
          <div class="min-w-56 flex-1 space-y-2">
            <Label for="approved-search">Offer name or item code</Label>
            <Input
              id="approved-search"
              type="search"
              placeholder="Search"
              maxlength={100}
              bind:value={search}
              oninput={scheduleSearch}
            />
          </div>
        </div>

        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Item</Table.Head>
              <Table.Head>Brand</Table.Head>
              <Table.Head>Channel</Table.Head>
              <Table.Head class="text-right">FC €</Table.Head>
              <Table.Head class="text-right">Ideal</Table.Head>
              <Table.Head class="text-right">Selling</Table.Head>
              <Table.Head class="text-right">FC %</Table.Head>
              <Table.Head>Approved</Table.Head>
              <Table.Head>Approved by</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#if data.offers.length === 0}
              <Table.Row>
                <Table.Cell
                  colspan={9}
                  class="text-muted-foreground py-10 text-center"
                >
                  No approved offers match these filters.
                </Table.Cell>
              </Table.Row>
            {:else}
              {#each data.offers as offer (offer.id)}
                <Table.Row>
                  <Table.Cell>
                    <div class="space-y-1">
                      <p class="font-medium">{offer.item_name}</p>
                      <p class="text-muted-foreground font-mono text-xs">
                        {offer.trde_item}
                      </p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{offer.brand}</Table.Cell>
                  <Table.Cell>{offer.channel}</Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {offer.fc_eur ?? "—"}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {offer.ideal_price}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {offer.selling_price}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {offer.fc_perc}%
                  </Table.Cell>
                  <Table.Cell>{formatDate(offer.approved_at)}</Table.Cell>
                  <Table.Cell>{offer.approved_by_name ?? "—"}</Table.Cell>
                </Table.Row>
              {/each}
            {/if}
          </Table.Body>
        </Table.Root>

        {#if data.totalItems > 0}
          <div
            class="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-muted-foreground text-sm">
              Showing {(data.page - 1) * data.pageSize + 1}-{Math.min(
                data.page * data.pageSize,
                data.totalItems,
              )} of {data.totalItems} approved offers
            </div>
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                onclick={() => goToPage(data.page - 1)}
                disabled={data.page <= 1}
              >
                Previous
              </Button>
              <span class="text-muted-foreground px-2 text-sm">
                Page {data.page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                onclick={() => goToPage(data.page + 1)}
                disabled={data.page >= data.totalPages}
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
