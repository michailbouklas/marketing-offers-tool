<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { fetchCategoryReviews } from "$lib/services/google-reviews/google-reviews-client";
  import {
    formatGoogleReviewsDateTime,
    formatSentimentLabel,
    sentimentBadgeClass,
    type GoogleReviewRow,
    type ReviewCategoryMetric,
  } from "$lib/services/google-reviews/google-reviews";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import StarIcon from "@lucide/svelte/icons/star";
  import { toast } from "svelte-sonner";

  let {
    open = $bindable(false),
    cid,
    category,
  }: {
    open?: boolean;
    cid: string;
    category: ReviewCategoryMetric | null;
  } = $props();

  const numberFormatter = new Intl.NumberFormat();

  let reviews = $state<GoogleReviewRow[]>([]);
  let page = $state(1);
  let totalItems = $state(0);
  let loading = $state(false);
  let loadingMore = $state(false);
  // Tracks which (cid, category) the current `reviews` belong to, so the effect
  // only refetches when the dialog (re)opens for a different category.
  let loadedKey = $state<string | null>(null);

  const hasMore = $derived(reviews.length < totalItems);

  async function loadPage(
    targetPage: number,
    categoryId: number,
    append = false,
  ) {
    if (append) {
      loadingMore = true;
    } else {
      loading = true;
    }

    try {
      const result = await fetchCategoryReviews(
        fetch,
        cid,
        categoryId,
        targetPage,
      );
      reviews = append ? [...reviews, ...result.items] : result.items;
      page = result.page;
      totalItems = result.totalItems;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load reviews for this category.",
      );
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function loadMore() {
    if (!category || loadingMore) {
      return;
    }

    void loadPage(page + 1, category.categoryId, true);
  }

  $effect(() => {
    if (!open) {
      loadedKey = null;
      return;
    }

    if (!category) {
      return;
    }

    const key = `${cid}:${category.categoryId}`;

    if (key === loadedKey) {
      return;
    }

    loadedKey = key;
    reviews = [];
    page = 1;
    totalItems = 0;
    void loadPage(1, category.categoryId);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="capitalize">
        {category?.category ?? "Category"}
      </Dialog.Title>
      <Dialog.Description>
        {#if category}
          {numberFormatter.format(category.reviewCount)} reviews in this category.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if loading}
      <div
        class="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircleIcon class="size-4 animate-spin" />
        Loading reviews…
      </div>
    {:else if reviews.length === 0}
      <p class="text-muted-foreground py-10 text-center text-sm">
        No reviews are tagged with this category yet.
      </p>
    {:else}
      <div class="divide-border divide-y">
        {#each reviews as review (review.id)}
          <div class="space-y-2 py-4 first:pt-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{review.reviewerName}</span>
              <span class="inline-flex items-center gap-1 tabular-nums">
                {review.rating}
                <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
              </span>
              {#if review.sentiment}
                <Badge
                  variant="outline"
                  class={sentimentBadgeClass(review.sentiment)}
                >
                  {formatSentimentLabel(review.sentiment)}
                </Badge>
              {/if}
              <span class="text-muted-foreground text-xs">
                {formatGoogleReviewsDateTime(review.reviewDate)}
              </span>
            </div>
            {#if review.reviewText}
              <p class="text-muted-foreground text-sm leading-6">
                {review.reviewText}
              </p>
            {/if}
          </div>
        {/each}
      </div>

      {#if hasMore}
        <div class="pt-2">
          <Button
            variant="outline"
            class="w-full"
            disabled={loadingMore}
            onclick={loadMore}
          >
            {#if loadingMore}
              <LoaderCircleIcon class="size-4 animate-spin" />
              Loading…
            {:else}
              Load more ({numberFormatter.format(reviews.length)} of {numberFormatter.format(
                totalItems,
              )})
            {/if}
          </Button>
        </div>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
