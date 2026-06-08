<script lang="ts">
  import OfferPriceHistoryChart from "$lib/components/competition/offer-price-history-chart.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatCompetitionDateTime,
    formatCompetitionMoney,
  } from "$lib/services/competition/competition";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import StarIcon from "@lucide/svelte/icons/star";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const restaurant = $derived(data.detail.restaurant);
  const activeOffers = $derived(data.detail.activeOffers);
  const menu = $derived(data.detail.menu);
  const offerHistories = $derived(data.detail.offerHistories);

  const totalProducts = $derived(
    menu.reduce((sum, category) => sum + category.products.length, 0),
  );

  function formatRating() {
    if (restaurant.rating === null) {
      return "—";
    }

    const scale =
      restaurant.ratingScale !== null ? ` / ${restaurant.ratingScale}` : "";
    const count =
      restaurant.ratingCount !== null ? ` (${restaurant.ratingCount})` : "";

    return `${restaurant.rating}${scale}${count}`;
  }

  const infoRows = $derived(
    [
      { label: "Aggregator", value: restaurant.processorName ?? "—" },
      { label: "Rating", value: formatRating() },
      {
        label: "Minimum order",
        value: formatCompetitionMoney(restaurant.minimumOrder, null),
      },
      { label: "Delivery", value: restaurant.deliveryInfo ?? "—" },
      { label: "External id", value: restaurant.externalId || "—" },
      {
        label: "First scraped",
        value: formatCompetitionDateTime(restaurant.createdAt),
      },
      {
        label: "Last updated",
        value: formatCompetitionDateTime(restaurant.updatedAt),
      },
    ].filter((row) => row.value !== "—"),
  );
</script>

<svelte:head>
  <title>{restaurant.name} | Competition | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Competitor restaurant detail: current offers, full menu, and offer history."
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
      <a href="/competition" class="hover:text-foreground transition-colors"
        >Competition</a
      >
      <ChevronRightIcon class="size-3" />
      <a
        href="/competition/restaurants"
        class="hover:text-foreground transition-colors">Restaurants</a
      >
      <ChevronRightIcon class="size-3" />
      <span class="normal-case">{restaurant.name}</span>
    </div>

    <section class="space-y-3">
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        {restaurant.processorName ?? "Unknown aggregator"}
      </Badge>
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {restaurant.name}
        </h1>
        {#if restaurant.rating !== null}
          <span class="text-muted-foreground flex items-center gap-1 text-lg">
            <StarIcon class="size-5 fill-amber-400 text-amber-400" />
            {restaurant.rating}
          </span>
        {/if}
      </div>
      <p class="text-muted-foreground text-base">
        {activeOffers.length} active offer{activeOffers.length === 1 ? "" : "s"} ·
        {totalProducts} product{totalProducts === 1 ? "" : "s"} in {menu.length}
        categor{menu.length === 1 ? "y" : "ies"}
      </p>
    </section>

    <section class="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <Card.Root class="h-fit">
        <Card.Header>
          <Card.Title>Store details</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl class="space-y-3 text-sm">
            {#each infoRows as row (row.label)}
              <div class="flex justify-between gap-4">
                <dt class="text-muted-foreground shrink-0">{row.label}</dt>
                <dd class="text-right font-medium capitalize">{row.value}</dd>
              </div>
            {/each}
          </dl>
          {#if restaurant.sourceUrl}
            <a
              href={restaurant.sourceUrl}
              target="_blank"
              rel="noreferrer"
              class="text-primary mt-4 inline-block text-sm hover:underline"
            >
              View on {restaurant.processorName ?? "aggregator"} →
            </a>
          {/if}
        </Card.Content>
      </Card.Root>

      <div class="flex flex-col gap-6">
        <Card.Root>
          <Card.Header>
            <Card.Title>Current offers</Card.Title>
            <Card.Description>
              Offers running on {restaurant.processorName ?? "the aggregator"}
              right now.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            {#if activeOffers.length === 0}
              <p class="text-muted-foreground text-sm">
                No active offers at the moment.
              </p>
            {:else}
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Offer</Table.Head>
                    <Table.Head class="text-right">Price</Table.Head>
                    <Table.Head>First seen</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each activeOffers as offer (offer.id)}
                    <Table.Row>
                      <Table.Cell class="max-w-72">
                        <p class="truncate font-medium">{offer.name}</p>
                        {#if offer.description}
                          <p class="text-muted-foreground truncate text-xs">
                            {offer.description}
                          </p>
                        {/if}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {formatCompetitionMoney(offer.price, offer.currency)}
                      </Table.Cell>
                      <Table.Cell
                        class="text-muted-foreground whitespace-nowrap"
                      >
                        {formatCompetitionDateTime(offer.firstSeen)}
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
            <Card.Title>Offer history</Card.Title>
            <Card.Description>
              How each offer's price and status evolved over time.
            </Card.Description>
          </Card.Header>
          <Card.Content class="space-y-8">
            {#if offerHistories.length === 0}
              <p class="text-muted-foreground text-sm">
                No offer history captured yet.
              </p>
            {:else}
              {#each offerHistories as history (history.offerId)}
                <div class="space-y-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-medium">{history.offerName}</h3>
                    <Badge
                      variant={history.active ? "default" : "secondary"}
                      class="capitalize"
                    >
                      {history.active ? "active" : "inactive"}
                    </Badge>
                  </div>

                  <OfferPriceHistoryChart {history} />

                  <Table.Root>
                    <Table.Header>
                      <Table.Row>
                        <Table.Head>Event</Table.Head>
                        <Table.Head>Date</Table.Head>
                        <Table.Head class="text-right">Price</Table.Head>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {#each history.transitions as transition (`${history.offerId}-${transition.effectiveAt}-${transition.status}`)}
                        <Table.Row>
                          <Table.Cell>
                            <Badge
                              variant={transition.status === "active"
                                ? "default"
                                : "secondary"}
                            >
                              {transition.status === "active"
                                ? "Activated"
                                : "Went inactive"}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell
                            class="text-muted-foreground whitespace-nowrap"
                          >
                            {formatCompetitionDateTime(transition.effectiveAt)}
                          </Table.Cell>
                          <Table.Cell class="text-right tabular-nums">
                            {formatCompetitionMoney(transition.price, null)}
                          </Table.Cell>
                        </Table.Row>
                      {/each}
                    </Table.Body>
                  </Table.Root>
                </div>
              {/each}
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title>Menu</Card.Title>
            <Card.Description>
              {totalProducts} products grouped by the aggregator's categories.
            </Card.Description>
          </Card.Header>
          <Card.Content class="space-y-8">
            {#if menu.length === 0}
              <p class="text-muted-foreground text-sm">
                No products scraped for this store yet.
              </p>
            {:else}
              {#each menu as category (category.id ?? "uncategorized")}
                <div class="space-y-3">
                  <h3 class="font-medium">
                    {category.name}
                    <span class="text-muted-foreground text-sm font-normal">
                      · {category.products.length} item{category.products
                        .length === 1
                        ? ""
                        : "s"}
                    </span>
                  </h3>
                  <Table.Root>
                    <Table.Header>
                      <Table.Row>
                        <Table.Head>Product</Table.Head>
                        <Table.Head class="text-right">Price</Table.Head>
                        <Table.Head>Offer</Table.Head>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {#each category.products as product (product.id)}
                        <Table.Row>
                          <Table.Cell class="max-w-80">
                            <p class="truncate font-medium">{product.name}</p>
                            {#if product.description}
                              <p class="text-muted-foreground truncate text-xs">
                                {product.description}
                              </p>
                            {/if}
                          </Table.Cell>
                          <Table.Cell class="text-right tabular-nums">
                            {formatCompetitionMoney(
                              product.price,
                              product.currency,
                            )}
                          </Table.Cell>
                          <Table.Cell>
                            {#if product.isOffer}
                              <Badge variant="secondary">Offer</Badge>
                            {:else}
                              <span class="text-muted-foreground">—</span>
                            {/if}
                          </Table.Cell>
                        </Table.Row>
                      {/each}
                    </Table.Body>
                  </Table.Root>
                </div>
              {/each}
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    </section>
  </main>
</div>
