<script lang="ts">
  import { superForm } from "sveltekit-superforms/client";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { formatBrandLabel, type BrandOption } from "$lib/services/brands";
  import {
    aggregatorOptions,
    type OffersFilterFormData,
  } from "$lib/services/offers-filter-form";
  import type { SuperValidated } from "sveltekit-superforms";

  type Props = {
    filterForm: SuperValidated<OffersFilterFormData>;
    brands: BrandOption[];
  };

  let { filterForm, brands }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form } = superForm(filterForm, {
    resetForm: false,
  });
</script>

<Card.Root
  class="border-border/70 bg-background/88 gap-0 overflow-hidden backdrop-blur"
>
  <Card.Header class="gap-3 pb-4">
    <div class="space-y-1">
      <Card.Title class="text-2xl tracking-[-0.03em]">Filters</Card.Title>
      <Card.Description class="text-sm leading-6">
        Refine the offer list by field without leaving the page.
      </Card.Description>
    </div>
  </Card.Header>

  <Separator />

  <Card.Content class="pt-6">
    <form method="GET" class="space-y-6">
      <input
        type="hidden"
        name="lifecyclePreset"
        bind:value={$form.lifecyclePreset}
      />

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div class="space-y-2">
          <Label for="offer-filter-id">ID</Label>
          <Input
            id="offer-filter-id"
            name="id"
            inputmode="numeric"
            bind:value={$form.id}
          />
        </div>

        <div class="space-y-2">
          <Label for="offer-filter-offer-id">Offer ID</Label>
          <Input
            id="offer-filter-offer-id"
            name="offerId"
            bind:value={$form.offerId}
          />
        </div>

        <div class="space-y-2">
          <Label for="offer-filter-name">Name</Label>
          <Input id="offer-filter-name" name="name" bind:value={$form.name} />
        </div>

        <div class="space-y-2">
          <Label for="offer-filter-brand">Brand</Label>
          <NativeSelect.Root
            id="offer-filter-brand"
            name="brandId"
            class="w-full"
            bind:value={$form.brandId}
          >
            <NativeSelect.Option value="">All brands</NativeSelect.Option>
            {#each brands as brand}
              <NativeSelect.Option value={brand.id.toString()}>
                {formatBrandLabel(brand)}
              </NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>

        <div class="space-y-2">
          <Label for="offer-filter-aggregator">Aggregator</Label>
          <NativeSelect.Root
            id="offer-filter-aggregator"
            name="aggregator"
            class="w-full"
            bind:value={$form.aggregator}
          >
            <NativeSelect.Option value="">All aggregators</NativeSelect.Option>
            {#each aggregatorOptions as option}
              <NativeSelect.Option value={option}>{option}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>

        <div class="space-y-2">
          <Label for="offer-filter-active">Active flag</Label>
          <NativeSelect.Root
            id="offer-filter-active"
            name="activeState"
            class="w-full"
            bind:value={$form.activeState}
          >
            <NativeSelect.Option value="all">All offers</NativeSelect.Option>
            <NativeSelect.Option value="active">Active only</NativeSelect.Option
            >
            <NativeSelect.Option value="inactive"
              >Inactive only</NativeSelect.Option
            >
          </NativeSelect.Root>
        </div>

        <div class="space-y-2 sm:col-span-2 lg:col-span-1">
          <Label for="offer-filter-details">Details contains</Label>
          <Input
            id="offer-filter-details"
            name="details"
            bind:value={$form.details}
          />
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <p class="text-foreground text-sm font-medium">Campaign window</p>
          <p class="text-muted-foreground mt-1 text-xs leading-5">
            Use date ranges to narrow start and end timestamps.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div class="space-y-2">
            <Label for="offer-filter-starts-from">Starts from</Label>
            <Input
              id="offer-filter-starts-from"
              name="startsFrom"
              type="date"
              bind:value={$form.startsFrom}
            />
          </div>

          <div class="space-y-2">
            <Label for="offer-filter-starts-to">Starts to</Label>
            <Input
              id="offer-filter-starts-to"
              name="startsTo"
              type="date"
              bind:value={$form.startsTo}
            />
          </div>

          <div class="space-y-2">
            <Label for="offer-filter-ends-from">Ends from</Label>
            <Input
              id="offer-filter-ends-from"
              name="endsFrom"
              type="date"
              bind:value={$form.endsFrom}
            />
          </div>

          <div class="space-y-2">
            <Label for="offer-filter-ends-to">Ends to</Label>
            <Input
              id="offer-filter-ends-to"
              name="endsTo"
              type="date"
              bind:value={$form.endsTo}
            />
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <p class="text-foreground text-sm font-medium">Audit dates</p>
          <p class="text-muted-foreground mt-1 text-xs leading-5">
            Filter by when a record entered or last changed in the system.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div class="space-y-2">
            <Label for="offer-filter-created-from">Created from</Label>
            <Input
              id="offer-filter-created-from"
              name="createdFrom"
              type="date"
              bind:value={$form.createdFrom}
            />
          </div>

          <div class="space-y-2">
            <Label for="offer-filter-created-to">Created to</Label>
            <Input
              id="offer-filter-created-to"
              name="createdTo"
              type="date"
              bind:value={$form.createdTo}
            />
          </div>

          <div class="space-y-2">
            <Label for="offer-filter-updated-from">Updated from</Label>
            <Input
              id="offer-filter-updated-from"
              name="updatedFrom"
              type="date"
              bind:value={$form.updatedFrom}
            />
          </div>

          <div class="space-y-2">
            <Label for="offer-filter-updated-to">Updated to</Label>
            <Input
              id="offer-filter-updated-to"
              name="updatedTo"
              type="date"
              bind:value={$form.updatedTo}
            />
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3 pt-2 sm:flex-row lg:flex-col">
        <Button type="submit" class="w-full">Apply filters</Button>
        <Button href="/aggregator-offers" variant="outline" class="w-full"
          >Clear filters</Button
        >
      </div>
    </form>
  </Card.Content>
</Card.Root>
