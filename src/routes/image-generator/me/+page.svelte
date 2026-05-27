<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { GeneratedImageDTO } from "$lib/services/image-generator/image-generator";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let detailsOpen = $state(false);
  let selectedImageId = $state<string | null>(null);

  const images = $derived(data.imagePage.items);
  const promptGroups = $derived(data.promptGroups);
  const isPromptView = $derived(data.filters.view === "prompt");
  const modelOptions = $derived(data.filterOptions.models);
  const providerOptions = $derived(data.filterOptions.providers);
  const page = $derived(data.imagePage.page);
  const pageSize = $derived(data.imagePage.pageSize);
  const totalItems = $derived(data.imagePage.totalItems);
  const totalPages = $derived(data.imagePage.totalPages);
  const hasActiveFilters = $derived(
    Boolean(
      data.filters.date ||
      data.filters.model ||
      data.filters.provider ||
      isPromptView,
    ),
  );
  const hasAnyGenerations = $derived(
    images.length > 0 || hasActiveFilters || modelOptions.length > 0,
  );
  const visibleImages = $derived(
    isPromptView ? promptGroups.flatMap((group) => group.items) : images,
  );
  const visibleTotal = $derived(
    isPromptView ? visibleImages.length : totalItems,
  );
  const selectedImage = $derived(
    visibleImages.find((image) => image.id === selectedImageId) ?? null,
  );

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function openDetails(image: GeneratedImageDTO) {
    selectedImageId = image.id;
    detailsOpen = true;
  }

  function imageUrl(image: GeneratedImageDTO) {
    return `/api/images/${image.id}/file`;
  }

  function downloadFilename(image: GeneratedImageDTO): string {
    const slug = image.prompt
      .slice(0, 40)
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `${slug || "image"}-${image.id}.png`;
  }

  function formatDate(value: string): string {
    return dateFormatter.format(new Date(value));
  }

  function truncatePrompt(value: string): string {
    return value.length > 72 ? `${value.slice(0, 72)}...` : value;
  }

  function getRouteHref(targetPage = 1): string {
    const params = new URLSearchParams();

    if (data.filters.date) {
      params.set("date", data.filters.date);
    }

    if (data.filters.model) {
      params.set("model", data.filters.model);
    }

    if (data.filters.provider) {
      params.set("provider", data.filters.provider);
    }

    if (isPromptView) {
      params.set("view", "prompt");
    }

    if (!isPromptView && targetPage > 1) {
      params.set("page", targetPage.toString());
    }

    const query = params.toString();
    return query ? `/image-generator/me?${query}` : "/image-generator/me";
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

  function formatNullable(value: string | number | null | undefined): string {
    return value === null || value === undefined || value === ""
      ? "-"
      : String(value);
  }

  function formatDuration(ms: number | null): string {
    return ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`;
  }

  function statusBadgeVariant(
    status: GeneratedImageDTO["status"],
  ): "default" | "outline" | "destructive" | "secondary" {
    if (status === "completed") return "default";
    if (status === "failed") return "destructive";
    return "secondary";
  }
</script>

<svelte:head>
  <title>My Image Generations | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Review your generated images, prompts, models, and generation metadata."
  />
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <section class="space-y-3">
    <Badge
      variant="outline"
      class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
    >
      Image generator
    </Badge>
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          My generations
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Browse every image you generated, ordered from newest to oldest.
        </p>
      </div>
      <Button href="/image-generator" variant="outline">Generate more</Button>
    </div>
  </section>

  <section
    class="border-border/70 bg-background/90 overflow-hidden rounded-xl border shadow-sm"
  >
    {#if !hasAnyGenerations}
      <div class="text-muted-foreground p-10 text-center text-sm">
        You have not generated any images yet.
      </div>
    {:else}
      <form
        method="GET"
        class="border-border/70 grid gap-4 border-b p-4 lg:grid-cols-4"
      >
        <div class="grid gap-2">
          <Label for="generation-date-filter">Date</Label>
          <Input
            id="generation-date-filter"
            name="date"
            type="date"
            value={data.filters.date ?? ""}
          />
        </div>

        <div class="grid gap-2">
          <Label for="generation-model-filter">Model</Label>
          <NativeSelect.Root
            id="generation-model-filter"
            name="model"
            value={data.filters.model ?? ""}
          >
            <NativeSelect.Option value="">All models</NativeSelect.Option>
            {#each modelOptions as model (model.value)}
              <NativeSelect.Option value={model.value}
                >{model.label}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
        </div>

        <div class="grid gap-2">
          <Label for="generation-provider-filter">Provider</Label>
          <NativeSelect.Root
            id="generation-provider-filter"
            name="provider"
            value={data.filters.provider ?? ""}
          >
            <NativeSelect.Option value="">All providers</NativeSelect.Option>
            {#each providerOptions as provider (provider.value)}
              <NativeSelect.Option value={provider.value}
                >{provider.label}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
        </div>

        <div class="flex items-end justify-between gap-3 lg:justify-end">
          <p class="text-muted-foreground text-sm">
            {#if isPromptView}
              {promptGroups.length} prompt groups, {visibleTotal} images
            {:else}
              Showing {(page - 1) * pageSize +
                (totalItems === 0 ? 0 : 1)}-{Math.min(
                page * pageSize,
                totalItems,
              )} of {totalItems}
            {/if}
          </p>
          <Button
            type="submit"
            name="view"
            value={data.filters.view ?? "table"}
          >
            Apply
          </Button>
          <Button
            href="/image-generator/me"
            variant="outline"
            disabled={!hasActiveFilters}
          >
            Clear
          </Button>
        </div>

        <div
          class="border-border/70 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-4"
        >
          <div>
            <Label class="text-sm font-medium">View mode</Label>
            <p class="text-muted-foreground mt-1 text-sm">
              Switch between individual generations and prompt-level groups.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="view"
              value="table"
              variant={!isPromptView ? "default" : "outline"}
            >
              Table
            </Button>
            <Button
              type="submit"
              name="view"
              value="prompt"
              variant={isPromptView ? "default" : "outline"}
            >
              Group by prompt
            </Button>
          </div>
        </div>
      </form>

      {#if isPromptView}
        <div class="space-y-4 p-4">
          {#if promptGroups.length === 0}
            <div class="text-muted-foreground py-10 text-center text-sm">
              No generations match the selected filters.
            </div>
          {/if}

          {#each promptGroups as group (group.prompt)}
            <section class="overflow-hidden rounded-lg border">
              <div class="bg-muted/40 border-b p-4">
                <div
                  class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div class="space-y-1">
                    <p
                      class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
                    >
                      Prompt group
                    </p>
                    <h2 class="text-base leading-6 font-semibold">
                      {truncatePrompt(group.prompt)}
                    </h2>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <Badge variant="secondary"
                      >{group.items.length} images</Badge
                    >
                    <Badge variant="outline">
                      Latest {formatDate(group.latestCreatedAt)}
                    </Badge>
                  </div>
                </div>
              </div>

              <div class="overflow-x-auto">
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head class="w-24">Thumbnail</Table.Head>
                      <Table.Head>Model</Table.Head>
                      <Table.Head>Provider</Table.Head>
                      <Table.Head>Date</Table.Head>
                      <Table.Head class="text-right">Action</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {#each group.items as image (image.id)}
                      <Table.Row>
                        <Table.Cell>
                          {#if image.status === "completed"}
                            <img
                              src={imageUrl(image)}
                              alt={image.prompt}
                              class="size-16 rounded-md object-cover"
                              loading="lazy"
                            />
                          {:else}
                            <div
                              class="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-md text-xs capitalize"
                            >
                              {image.status}
                            </div>
                          {/if}
                        </Table.Cell>
                        <Table.Cell>
                          <div class="flex flex-col gap-1">
                            <span class="font-medium">
                              {image.model ?? "Default model"}
                            </span>
                            <Badge
                              variant={statusBadgeVariant(image.status)}
                              class="w-fit"
                            >
                              {image.status}
                            </Badge>
                          </div>
                        </Table.Cell>
                        <Table.Cell>{image.provider}</Table.Cell>
                        <Table.Cell
                          class="text-muted-foreground whitespace-nowrap"
                        >
                          {formatDate(image.createdAt)}
                        </Table.Cell>
                        <Table.Cell class="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onclick={() => openDetails(image)}
                          >
                            Details
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    {/each}
                  </Table.Body>
                </Table.Root>
              </div>
            </section>
          {/each}
        </div>
      {:else}
        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head class="w-24">Thumbnail</Table.Head>
                <Table.Head>Model</Table.Head>
                <Table.Head>Date</Table.Head>
                <Table.Head>Input</Table.Head>
                <Table.Head class="text-right">Action</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if images.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={5}
                    class="text-muted-foreground py-10 text-center"
                  >
                    No generations match the selected filters.
                  </Table.Cell>
                </Table.Row>
              {/if}

              {#each images as image (image.id)}
                <Table.Row>
                  <Table.Cell>
                    {#if image.status === "completed"}
                      <img
                        src={imageUrl(image)}
                        alt={image.prompt}
                        class="size-16 rounded-md object-cover"
                        loading="lazy"
                      />
                    {:else}
                      <div
                        class="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-md text-xs capitalize"
                      >
                        {image.status}
                      </div>
                    {/if}
                  </Table.Cell>
                  <Table.Cell>
                    <div class="flex flex-col gap-1">
                      <span class="font-medium">
                        {image.model ?? "Default model"}
                      </span>
                      <Badge
                        variant={statusBadgeVariant(image.status)}
                        class="w-fit"
                      >
                        {image.status}
                      </Badge>
                    </div>
                  </Table.Cell>
                  <Table.Cell class="text-muted-foreground whitespace-nowrap">
                    {formatDate(image.createdAt)}
                  </Table.Cell>
                  <Table.Cell class="max-w-md">
                    <p class="line-clamp-2 text-sm">
                      {truncatePrompt(image.prompt)}
                    </p>
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onclick={() => openDetails(image)}
                    >
                      Details
                    </Button>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}

      {#if totalItems > 0 && !isPromptView}
        <div
          class="border-border/70 flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              href={getRouteHref(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>

            {#each getVisiblePages() as visiblePage (visiblePage)}
              <Button
                href={getRouteHref(visiblePage)}
                variant={visiblePage === page ? "default" : "outline"}
                size="sm"
              >
                {visiblePage}
              </Button>
            {/each}

            <Button
              variant="outline"
              href={getRouteHref(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      {/if}
    {/if}
  </section>
</main>

<Dialog.Root bind:open={detailsOpen}>
  <Dialog.Content class="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
    {#if selectedImage}
      <Dialog.Header>
        <Dialog.Title>Generation details</Dialog.Title>
        <Dialog.Description>
          Created {formatDate(selectedImage.createdAt)} with {selectedImage.model ??
            "the default model"}.
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div class="space-y-4">
          {#if selectedImage.status === "completed"}
            <img
              src={imageUrl(selectedImage)}
              alt={selectedImage.prompt}
              class="bg-muted aspect-square w-full rounded-lg object-contain"
            />
          {:else}
            <div
              class="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center rounded-lg p-6 text-center text-sm"
            >
              {selectedImage.errorMessage ??
                `Image is ${selectedImage.status}.`}
            </div>
          {/if}

          <Button
            href={imageUrl(selectedImage)}
            download={downloadFilename(selectedImage)}
            disabled={selectedImage.status !== "completed"}
          >
            Download
          </Button>

          <div class="space-y-2">
            <h2 class="text-sm font-semibold">Full prompt</h2>
            <p
              class="bg-muted/60 rounded-md p-3 text-sm leading-6 whitespace-pre-wrap"
            >
              {selectedImage.prompt}
            </p>
          </div>

          {#if selectedImage.finalPrompt !== selectedImage.prompt}
            <div class="space-y-2">
              <h2 class="text-sm font-semibold">Final prompt</h2>
              <p
                class="bg-muted/60 rounded-md p-3 text-sm leading-6 whitespace-pre-wrap"
              >
                {selectedImage.finalPrompt}
              </p>
            </div>
          {/if}
        </div>

        <dl class="grid content-start gap-3 text-sm">
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Provider</dt>
            <dd class="mt-1 font-medium">{selectedImage.provider}</dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Model</dt>
            <dd class="mt-1 font-medium">
              {formatNullable(selectedImage.model)}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Status</dt>
            <dd class="mt-1">
              <Badge variant={statusBadgeVariant(selectedImage.status)}>
                {selectedImage.status}
              </Badge>
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Requested size</dt>
            <dd class="mt-1 font-medium">
              {selectedImage.requestedWidth} x {selectedImage.requestedHeight}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Generated size</dt>
            <dd class="mt-1 font-medium">
              {selectedImage.generationWidth} x {selectedImage.generationHeight}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Aspect ratio</dt>
            <dd class="mt-1 font-medium">
              {formatNullable(selectedImage.aspectRatio)}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Style</dt>
            <dd class="mt-1 font-medium">
              {formatNullable(selectedImage.style)}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Camera</dt>
            <dd class="mt-1 font-medium">
              {formatNullable(selectedImage.camera)}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">Duration</dt>
            <dd class="mt-1 font-medium">
              {formatDuration(selectedImage.durationMs)}
            </dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-muted-foreground">References</dt>
            <dd class="mt-1 font-medium">
              {selectedImage.referenceIds.length}
            </dd>
          </div>
          {#if selectedImage.errorMessage}
            <div
              class="border-destructive/30 text-destructive rounded-md border p-3"
            >
              <dt>Error</dt>
              <dd class="mt-1">{selectedImage.errorMessage}</dd>
            </div>
          {/if}
        </dl>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
