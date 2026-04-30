<script lang="ts">
  import { toast } from "svelte-sonner";
  import OfferEditorForm from "$lib/components/offers/offer-editor-form.svelte";
  import OffersFiltersSidebar from "$lib/components/offers/offers-filters-sidebar.svelte";
  import OffersTable from "$lib/components/offers/offers-table.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import {
    getDefaultOfferEditorFormData,
    mapOfferToEditorFormDefaults,
    type OfferEditorActionMessage,
  } from "$lib/services/offer-editor-form";
  import type { AggregatorOffer } from "$lib/services/aggregator-offers";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let createOfferOpen = $state(false);
  let editOfferOpen = $state(false);
  let filtersOpen = $state(false);
  let selectedOffer = $state<AggregatorOffer | null>(null);
  let highlightedOfferId = $state<number | null>(null);
  const canManageOffers = $derived(data.user?.role === "admin");

  const activeCount = $derived(
    data.offers.filter((offer) => offer.active).length,
  );
  const inactiveCount = $derived(data.offers.length - activeCount);
  const editValues = $derived(
    selectedOffer
      ? mapOfferToEditorFormDefaults(selectedOffer)
      : getDefaultOfferEditorFormData(),
  );

  function handleOfferSaved(message: OfferEditorActionMessage) {
    highlightedOfferId = message.offerId;
    toast.success(message.text);
  }

  function openEditOfferDialog(offer: AggregatorOffer) {
    selectedOffer = offer;
    editOfferOpen = true;
  }
</script>

<svelte:head>
  <title>Aggregator Offers | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Review aggregator offers in a filterable table with sidebar controls for every key field."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-2)_20%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_22%,transparent),transparent_26%)]"
  ></div>
  <div
    class="bg-chart-2/10 absolute top-28 left-0 -z-10 size-72 rounded-full blur-3xl"
  ></div>
  <div
    class="bg-chart-1/10 absolute right-0 bottom-10 -z-10 size-72 rounded-full blur-3xl"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div class="space-y-4">
        <Badge
          variant="outline"
          class="border-primary/20 bg-background/85 text-muted-foreground px-3 py-1 text-[0.7rem] tracking-[0.24em] uppercase backdrop-blur"
        >
          Offer registry
        </Badge>
        <div class="space-y-3">
          <h1
            class="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl"
          >
            Browse every aggregator offer from one operational view.
          </h1>
          <p
            class="text-muted-foreground max-w-3xl text-base leading-7 sm:text-lg"
          >
            Scan campaign timing, partner coverage, and lifecycle status without
            bouncing between database rows and ad hoc spreadsheets.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 lg:min-w-[20rem]">
        <div
          class="border-border/70 bg-background/85 rounded-2xl border p-4 shadow-sm backdrop-blur"
        >
          <p class="text-2xl font-semibold tracking-[-0.04em]">
            {data.offers.length}
          </p>
          <p class="text-muted-foreground mt-1 text-sm">Visible offers</p>
        </div>
        <div
          class="border-border/70 bg-background/85 rounded-2xl border p-4 shadow-sm backdrop-blur"
        >
          <p class="text-2xl font-semibold tracking-[-0.04em]">{activeCount}</p>
          <p class="text-muted-foreground mt-1 text-sm">Active flag</p>
        </div>
        <div
          class="border-border/70 bg-background/85 rounded-2xl border p-4 shadow-sm backdrop-blur"
        >
          <p class="text-2xl font-semibold tracking-[-0.04em]">
            {inactiveCount}
          </p>
          <p class="text-muted-foreground mt-1 text-sm">Inactive flag</p>
        </div>
      </div>
    </section>

    <section>
      <Card.Root
        class="border-border/70 bg-background/86 overflow-hidden backdrop-blur"
      >
        <Card.Header class="gap-3">
          <div
            class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="space-y-1">
              <Card.Title class="text-2xl tracking-[-0.03em]"
                >Offers table</Card.Title
              >
              <Card.Description class="text-sm leading-6">
                The list comes directly from the `aggregator_offers` records
                exposed through the `aggregator-offers` service.
              </Card.Description>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge variant="secondary" class="px-3 py-1">
                {data.offers.length} matching row{data.offers.length === 1
                  ? ""
                  : "s"}
              </Badge>

              <Dialog.Root bind:open={filtersOpen}>
                <Dialog.Trigger class={buttonVariants({ variant: "outline" })}>
                  Filter
                </Dialog.Trigger>
                <Dialog.Content
                  class="data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 top-0 right-0 left-auto h-dvh max-h-none w-full max-w-[26rem] translate-x-0 translate-y-0 overflow-y-auto rounded-none border-t-0 border-r-0 border-b-0 p-0 shadow-2xl sm:max-w-[26rem]"
                >
                  <Dialog.Header class="px-6 pt-6">
                    <Dialog.Title>Filters</Dialog.Title>
                    <Dialog.Description>
                      Narrow the table results without leaving the offers
                      workspace.
                    </Dialog.Description>
                  </Dialog.Header>

                  <div class="px-6 pb-6">
                    <OffersFiltersSidebar
                      filterForm={data.filterForm}
                      brands={data.brands}
                    />
                  </div>
                </Dialog.Content>
              </Dialog.Root>

              {#if canManageOffers}
                <Dialog.Root bind:open={createOfferOpen}>
                  <Dialog.Trigger class={buttonVariants()}>
                    Create Offer
                  </Dialog.Trigger>
                  <Dialog.Content class="sm:max-w-3xl">
                    <Dialog.Header>
                      <Dialog.Title>Create Offer</Dialog.Title>
                      <Dialog.Description>
                        Add a new aggregator campaign and save it directly to
                        the offers registry.
                      </Dialog.Description>
                    </Dialog.Header>

                    <OfferEditorForm
                      form={data.createForm}
                      mode="create"
                      brands={data.brands}
                      onSuccess={(message) => {
                        createOfferOpen = !!message.keepOpen;
                        handleOfferSaved(message);
                      }}
                    />
                  </Dialog.Content>
                </Dialog.Root>

                <Dialog.Root bind:open={editOfferOpen}>
                  <Dialog.Content class="sm:max-w-3xl">
                    <Dialog.Header>
                      <Dialog.Title>Edit Offer</Dialog.Title>
                      <Dialog.Description>
                        Update the selected campaign details without leaving the
                        offers workspace.
                      </Dialog.Description>
                    </Dialog.Header>

                    <OfferEditorForm
                      form={data.editForm}
                      mode="edit"
                      action="?/updateOffer"
                      values={editValues}
                      brands={data.brands}
                      offerDbId={selectedOffer?.id ?? null}
                      onSuccess={(message) => {
                        editOfferOpen = false;
                        handleOfferSaved(message);
                      }}
                    />
                  </Dialog.Content>
                </Dialog.Root>
              {/if}
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <OffersTable
            offers={data.offers}
            {highlightedOfferId}
            onEdit={canManageOffers ? openEditOfferDialog : undefined}
          />
        </Card.Content>
      </Card.Root>
    </section>
  </main>
</div>
