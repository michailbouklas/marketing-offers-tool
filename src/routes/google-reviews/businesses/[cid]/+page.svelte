<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatGoogleReviewsDateTime,
    formatRating,
    formatSentimentLabel,
    sentimentBadgeClass,
    type ReviewCategoryMetric,
  } from "$lib/services/google-reviews/google-reviews";
  import CategoryReviewsDialog from "./CategoryReviewsDialog.svelte";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import MapPinIcon from "@lucide/svelte/icons/map-pin";
  import PhoneIcon from "@lucide/svelte/icons/phone";
  import StarIcon from "@lucide/svelte/icons/star";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const profile = $derived(data.detail.profile);
  const starBreakdown = $derived(data.detail.starBreakdown);
  const sentiment = $derived(data.detail.sentiment);
  const categories = $derived(data.detail.categories);

  let dialogOpen = $state(false);
  let selectedCategory = $state<ReviewCategoryMetric | null>(null);

  function openCategory(category: ReviewCategoryMetric) {
    selectedCategory = category;
    dialogOpen = true;
  }

  const numberFormatter = new Intl.NumberFormat();

  const starBuckets = $derived(
    starBreakdown
      ? [...starBreakdown.buckets].sort((a, b) => b.stars - a.stars)
      : [],
  );
  const starTotal = $derived(
    starBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
  );

  const featureGroups = $derived.by(() => {
    const groups = new Map<string, typeof data.detail.features>();

    for (const feature of data.detail.features) {
      const group = groups.get(feature.category);

      if (group) {
        group.push(feature);
      } else {
        groups.set(feature.category, [feature]);
      }
    }

    return [...groups.entries()];
  });

  function formatPercentage(value: number | null) {
    return value === null ? "—" : `${value.toFixed(1)}%`;
  }
</script>

<svelte:head>
  <title>{profile.title} | Google Reviews | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Google reviews profile for {profile.title}: ratings, sentiment, reviews, and business details."
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
      <a href="/google-reviews" class="hover:text-foreground transition-colors"
        >Google Reviews</a
      >
      <ChevronRightIcon class="size-3" />
      <a
        href="/google-reviews/businesses"
        class="hover:text-foreground transition-colors">Businesses</a
      >
      <ChevronRightIcon class="size-3" />
      <span class="normal-case">{profile.title}</span>
    </div>

    <section class="flex flex-wrap items-end justify-between gap-4">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          {#if profile.category}
            <Badge variant="secondary">{profile.category}</Badge>
          {/if}
          {#if profile.status}
            <Badge variant="outline">{profile.status}</Badge>
          {/if}
          {#if profile.priceRange}
            <Badge variant="outline">{profile.priceRange}</Badge>
          {/if}
        </div>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {profile.title}
        </h1>
        {#if profile.description}
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            {profile.description}
          </p>
        {/if}
        <div
          class="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        >
          {#if profile.address}
            <span class="inline-flex items-center gap-1.5">
              <MapPinIcon class="size-4" />
              {profile.address}
            </span>
          {/if}
          {#if profile.phone}
            <span class="inline-flex items-center gap-1.5">
              <PhoneIcon class="size-4" />
              {profile.phone}
            </span>
          {/if}
          {#if profile.website}
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <GlobeIcon class="size-4" />
              Website
            </a>
          {/if}
          {#if profile.reviewsLink}
            <a
              href={profile.reviewsLink}
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <ExternalLinkIcon class="size-4" />
              Reviews on Google
            </a>
          {/if}
        </div>
      </div>
      <Button
        href={`/google-reviews/reviews?cid=${profile.cid}`}
        variant="outline"
      >
        View all reviews
      </Button>
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Star ratings</Card.Title>
          <Card.Description>
            {#if starBreakdown}
              {numberFormatter.format(starBreakdown.reviewCount)} reviews,
              {formatRating(starBreakdown.averageRating)} average rating.
            {:else}
              No review summary available yet.
            {/if}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if starTotal === 0}
            <p class="text-muted-foreground text-sm">No rated reviews yet.</p>
          {:else}
            <div class="space-y-3">
              {#each starBuckets as bucket (bucket.stars)}
                <div class="flex items-center gap-3">
                  <span
                    class="flex w-10 items-center gap-1 text-sm tabular-nums"
                  >
                    {bucket.stars}
                    <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
                  </span>
                  <div
                    class="bg-muted h-2.5 flex-1 overflow-hidden rounded-full"
                  >
                    <div
                      class="h-full rounded-full bg-amber-400"
                      style="width: {(bucket.count / starTotal) * 100}%"
                    ></div>
                  </div>
                  <span
                    class="text-muted-foreground w-20 text-right text-sm tabular-nums"
                  >
                    {numberFormatter.format(bucket.count)}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Categories</Card.Title>
          <Card.Description>
            {#if categories.length > 0}
              {numberFormatter.format(categories.length)} categories from the latest
              snapshot. Select one to read its reviews.
            {:else}
              No category breakdown available yet.
            {/if}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if categories.length === 0}
            <p class="text-muted-foreground text-sm">
              No categories captured yet.
            </p>
          {:else}
            <div class="space-y-3">
              {#each categories as item (item.categoryId)}
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="hover:text-foreground w-32 cursor-pointer truncate text-left text-sm capitalize underline-offset-2 hover:underline"
                    onclick={() => openCategory(item)}
                  >
                    {item.category}
                  </button>
                  <div
                    class="bg-muted h-2.5 flex-1 overflow-hidden rounded-full"
                  >
                    <div
                      class="bg-chart-1 h-full rounded-full"
                      style="width: {item.percentage ?? 0}%"
                    ></div>
                  </div>
                  <span
                    class="text-muted-foreground w-20 text-right text-sm tabular-nums"
                  >
                    {item.percentage === null
                      ? numberFormatter.format(item.reviewCount)
                      : `${item.percentage.toFixed(1)}%`}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Sentiment</Card.Title>
          <Card.Description>
            {#if sentiment}
              {numberFormatter.format(sentiment.totalReviews)} analyzed reviews{sentiment.lastUpdated
                ? `, updated ${formatGoogleReviewsDateTime(sentiment.lastUpdated)}`
                : ""}.
            {:else}
              No sentiment metrics available yet.
            {/if}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if !sentiment}
            <p class="text-muted-foreground text-sm">
              The sentiment pipeline has not processed this business yet.
            </p>
          {:else}
            <div class="grid grid-cols-3 gap-4">
              <div class="space-y-1">
                <p class="text-muted-foreground text-sm">Positive</p>
                <p class="text-2xl font-semibold text-emerald-600 tabular-nums">
                  {formatPercentage(sentiment.positivePercentage)}
                </p>
                <p class="text-muted-foreground text-xs tabular-nums">
                  {numberFormatter.format(sentiment.positiveCount)} reviews
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-muted-foreground text-sm">Neutral</p>
                <p class="text-2xl font-semibold tabular-nums">
                  {formatPercentage(sentiment.neutralPercentage)}
                </p>
                <p class="text-muted-foreground text-xs tabular-nums">
                  {numberFormatter.format(sentiment.neutralCount)} reviews
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-muted-foreground text-sm">Negative</p>
                <p class="text-2xl font-semibold text-red-600 tabular-nums">
                  {formatPercentage(sentiment.negativePercentage)}
                </p>
                <p class="text-muted-foreground text-xs tabular-nums">
                  {numberFormatter.format(sentiment.negativeCount)} reviews
                </p>
              </div>
            </div>
            {#if sentiment.sentimentScore !== null}
              <p class="text-muted-foreground mt-4 text-sm">
                Sentiment score:
                <span class="text-foreground font-medium tabular-nums">
                  {sentiment.sentimentScore.toFixed(2)}
                </span>
              </p>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <Card.Root>
      <Card.Header>
        <Card.Title>Recent reviews</Card.Title>
        <Card.Description>
          The latest reviews the scraper captured for this business.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if data.detail.recentReviews.length === 0}
          <p class="text-muted-foreground text-sm">No reviews captured yet.</p>
        {:else}
          <div class="divide-border divide-y">
            {#each data.detail.recentReviews as review (review.id)}
              <div class="space-y-2 py-4 first:pt-0 last:pb-0">
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
        {/if}
      </Card.Content>
    </Card.Root>

    <section class="grid gap-6 xl:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Operating hours</Card.Title>
        </Card.Header>
        <Card.Content>
          {#if data.detail.operatingHours.length === 0}
            <p class="text-muted-foreground text-sm">
              No operating hours captured.
            </p>
          {:else}
            <Table.Root>
              <Table.Body>
                {#each data.detail.operatingHours as entry (entry.dayOfWeek)}
                  <Table.Row>
                    <Table.Cell class="font-medium capitalize">
                      {entry.dayOfWeek}
                    </Table.Cell>
                    <Table.Cell class="text-muted-foreground">
                      {entry.hours}
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Ordering options</Card.Title>
        </Card.Header>
        <Card.Content>
          {#if data.detail.orderingOptions.length === 0}
            <p class="text-muted-foreground text-sm">
              No ordering platforms captured.
            </p>
          {:else}
            <ul class="space-y-2">
              {#each data.detail.orderingOptions as option (option.platformName + option.orderUrl)}
                <li>
                  <a
                    href={option.orderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:text-foreground text-muted-foreground inline-flex items-center gap-2 text-sm transition-colors"
                  >
                    <ExternalLinkIcon class="size-4" />
                    <span class="font-medium capitalize"
                      >{option.platformName}</span
                    >
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    {#if featureGroups.length > 0}
      <Card.Root>
        <Card.Header>
          <Card.Title>Features</Card.Title>
          <Card.Description>
            Amenities and services Google lists for this business.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {#each featureGroups as [category, features] (category)}
              <div class="space-y-2">
                <h3 class="text-sm font-medium capitalize">{category}</h3>
                <div class="flex flex-wrap gap-1.5">
                  {#each features as feature (feature.name)}
                    <Badge
                      variant={feature.isEnabled === false
                        ? "outline"
                        : "secondary"}
                      class={feature.isEnabled === false
                        ? "text-muted-foreground line-through"
                        : ""}
                    >
                      {feature.name}
                    </Badge>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}
  </main>
</div>

<CategoryReviewsDialog
  bind:open={dialogOpen}
  cid={profile.cid}
  category={selectedCategory}
/>
