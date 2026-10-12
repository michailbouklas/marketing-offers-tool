<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import CheckCheckIcon from "@lucide/svelte/icons/check-check";
  import ListTodoIcon from "@lucide/svelte/icons/list-todo";
  import SearchIcon from "@lucide/svelte/icons/search";
  import XIcon from "@lucide/svelte/icons/x";
  import ReviewCategoriesTable from "$lib/components/admin/google-reviews/review-categories-table.svelte";
  import ReviewCategoryDialog from "$lib/components/admin/google-reviews/review-category-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import type {
    ReviewCategoryActionMessage,
    ReviewCategoryStatusFilter,
  } from "$lib/services/google-reviews-admin/categories";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let searchForm: HTMLFormElement | null = null;
  let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let bulkForm: HTMLFormElement | null = null;

  let selectedIds = $state<number[]>([]);
  let processingIds = $state<number[]>([]);
  let bulkPayload = $state("");
  let detailOpen = $state(false);
  let detailCategoryId = $state<number | null>(null);

  const rows = $derived(data.categoriesPage.items);
  const page = $derived(data.categoriesPage.page);
  const pageSize = $derived(data.categoriesPage.pageSize);
  const totalItems = $derived(data.categoriesPage.totalItems);
  const totalPages = $derived(data.categoriesPage.totalPages);
  const totals = $derived(data.categoriesPage.totals);
  const searchQuery = $derived(data.query ?? "");
  const status = $derived(data.status);

  const selectedIdSet = $derived(new Set(selectedIds));
  const processingIdSet = $derived(new Set(processingIds));
  const selectedCount = $derived(selectedIds.length);
  const activeCategory = $derived(
    rows.find((row) => row.id === detailCategoryId) ?? null,
  );

  const statusOptions: { value: ReviewCategoryStatusFilter; label: string }[] =
    [
      { value: "all", label: "All categories" },
      { value: "active", label: "Active only" },
      { value: "inactive", label: "Inactive only" },
    ];

  // A new page of rows (navigation, filter change, or invalidation after a
  // write) drops any selection that no longer points at a visible row.
  $effect(() => {
    const visibleIds = new Set(rows.map((row) => row.id));
    const current = untrack(() => selectedIds);
    const stillVisible = current.filter((id) => visibleIds.has(id));

    if (stillVisible.length !== current.length) {
      selectedIds = stillVisible;
    }
  });

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
      ? `/admin/google-reviews/categories?${queryString}`
      : "/admin/google-reviews/categories";
  }

  function toggleSelection(id: number) {
    if (processingIdSet.has(id)) {
      return;
    }

    if (selectedIdSet.has(id)) {
      selectedIds = selectedIds.filter((value) => value !== id);
      return;
    }

    selectedIds = [...selectedIds, id];
  }

  function toggleAll() {
    const availableIds = rows
      .filter((row) => !processingIdSet.has(row.id))
      .map((row) => row.id);

    const allSelected =
      availableIds.length > 0 &&
      availableIds.every((id) => selectedIdSet.has(id));

    selectedIds = allSelected ? [] : availableIds;
  }

  function openCategory(id: number) {
    detailCategoryId = id;
    detailOpen = true;
  }

  function handleDialogMessage(message: ReviewCategoryActionMessage) {
    if (message.type === "success") {
      toast.success(message.text);
    } else {
      toast.error(message.text);
    }
  }

  function submitBulk(isActive: boolean) {
    if (selectedIds.length === 0) {
      toast.error("Select at least one category first.");
      return;
    }

    bulkPayload = JSON.stringify({ ids: selectedIds, isActive });
    processingIds = [...selectedIds];

    // Let the hidden input pick up the new payload before submitting.
    queueMicrotask(() => bulkForm?.requestSubmit());
  }
</script>

<svelte:head>
  <title>Review categories | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Edit Google Reviews categories at the source: rename, rewrite summaries, and activate or deactivate in bulk."
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
          Source database
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Review categories
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Click a category to rename it or rewrite its summary. Select rows to
            activate or deactivate several at once. Edits replicate to the
            analytics pages automatically.
          </p>
        </div>
      </div>

      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Content class="grid gap-4 p-5">
          <div>
            <p class="text-3xl font-semibold tracking-[-0.04em]">
              {totals.active}
            </p>
            <p class="text-muted-foreground mt-1 text-sm">
              Active of {totals.all} categories
            </p>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]">
              Categories
            </Card.Title>
            <Card.Description>
              Showing page {page} of {totalPages} with up to {pageSize} rows per page
              ({totalItems} matching).
            </Card.Description>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              class="bg-muted/50 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <ListTodoIcon class="text-muted-foreground size-4" />
              <span>{selectedCount} selected</span>
            </div>
            <Button
              disabled={selectedCount === 0 || processingIds.length > 0}
              onclick={() => submitBulk(true)}
            >
              <CheckCheckIcon class="size-4" />
              Activate selected
            </Button>
            <Button
              variant="outline"
              class="border-destructive/30 text-destructive hover:bg-destructive/6"
              disabled={selectedCount === 0 || processingIds.length > 0}
              onclick={() => submitBulk(false)}
            >
              <XIcon class="size-4" />
              Deactivate selected
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
                placeholder="Category name"
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
          <ReviewCategoriesTable
            {rows}
            {selectedIds}
            {processingIds}
            ontoggleselection={toggleSelection}
            ontoggleall={toggleAll}
            onopen={openCategory}
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

    <form
      method="POST"
      action="?/setActive"
      bind:this={bulkForm}
      class="hidden"
      use:enhance={() => {
        return async ({ result }) => {
          processingIds = [];

          if (result.type === "success") {
            const updated = Number(result.data?.bulkUpdated ?? 0);
            const isActive = result.data?.bulkIsActive === true;

            selectedIds = [];
            toast.success(
              isActive
                ? `Activated ${updated} ${updated === 1 ? "category" : "categories"}.`
                : `Deactivated ${updated} ${updated === 1 ? "category" : "categories"}.`,
            );
            await invalidateAll();
            return;
          }

          if (result.type === "failure") {
            toast.error(
              typeof result.data?.bulkError === "string"
                ? result.data.bulkError
                : "Unable to update the selected categories.",
            );
            return;
          }

          if (result.type === "error") {
            toast.error("Unable to update the selected categories.");
          }
        };
      }}
    >
      <input type="hidden" name="payload" value={bulkPayload} />
    </form>

    <ReviewCategoryDialog
      bind:open={detailOpen}
      editForm={data.editForm}
      category={activeCategory}
      onmessage={handleDialogMessage}
    />
  </main>
</div>
