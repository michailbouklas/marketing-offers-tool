<script lang="ts">
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { AggregatorOffer } from "$lib/services/aggregator-offers";

  type Props = {
    offers: AggregatorOffer[];
    highlightedOfferId?: number | null;
    onEdit?: (offer: AggregatorOffer) => void;
  };

  let { offers, highlightedOfferId = null, onEdit }: Props = $props();
  const canEdit = $derived(Boolean(onEdit));

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const compactDateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  });

  const now = new Date();

  function formatDate(value: Date) {
    return dateFormatter.format(value);
  }

  function formatShortDate(value: Date) {
    return compactDateFormatter.format(value);
  }

  function getLifecycleState(offer: AggregatorOffer) {
    if (!offer.active) {
      return { label: "Inactive", variant: "destructive" as BadgeVariant };
    }

    if (offer.starts_at > now) {
      return { label: "Scheduled", variant: "secondary" as BadgeVariant };
    }

    if (offer.ends_at < now) {
      return { label: "Ended", variant: "outline" as BadgeVariant };
    }

    return { label: "Live", variant: "default" as BadgeVariant };
  }

  function formatAggregatorLabel(value: AggregatorOffer["aggregator"]) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
</script>

<Table.Root>
  <Table.Caption class="text-muted-foreground pb-4 text-left text-sm">
    {offers.length} offer{offers.length === 1 ? "" : "s"} matched the current filters.
  </Table.Caption>
  <Table.Header>
    <Table.Row>
      <Table.Head class="w-16">ID</Table.Head>
      <Table.Head class="min-w-32">Offer ID</Table.Head>
      <Table.Head class="min-w-52">Name</Table.Head>
      <Table.Head class="min-w-32">Brand</Table.Head>
      <Table.Head class="min-w-28">Aggregator</Table.Head>
      <Table.Head class="min-w-28">Status</Table.Head>
      <Table.Head class="min-w-72">Details</Table.Head>
      <Table.Head class="min-w-44">Starts</Table.Head>
      <Table.Head class="min-w-44">Ends</Table.Head>
      <Table.Head class="min-w-44">Created</Table.Head>
      <Table.Head class="min-w-44">Updated</Table.Head>
      {#if canEdit}
        <Table.Head class="min-w-28 text-right">Actions</Table.Head>
      {/if}
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#if offers.length > 0}
      {#each offers as offer}
        {@const lifecycle = getLifecycleState(offer)}
        <Table.Row
          class={offer.id === highlightedOfferId
            ? "bg-primary/5 ring-primary/20 align-top ring-1 ring-inset"
            : "align-top"}
        >
          <Table.Cell class="font-medium">{offer.id}</Table.Cell>
          <Table.Cell class="font-mono text-xs tracking-[0.12em] uppercase">
            {offer.offer_id}
          </Table.Cell>
          <Table.Cell>
            <div class="space-y-1">
              <p class="font-medium tracking-[-0.01em]">{offer.name}</p>
              <p class="text-muted-foreground text-xs">
                {formatShortDate(offer.starts_at)} - {formatShortDate(
                  offer.ends_at,
                )}
              </p>
            </div>
          </Table.Cell>
          <Table.Cell>{offer.brand.name}</Table.Cell>
          <Table.Cell>
            <Badge variant="outline"
              >{formatAggregatorLabel(offer.aggregator)}</Badge
            >
          </Table.Cell>
          <Table.Cell>
            <div class="flex flex-col gap-2">
              <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
              <span class="text-muted-foreground text-xs">
                Flag: {offer.active ? "Active" : "Inactive"}
              </span>
            </div>
          </Table.Cell>
          <Table.Cell>
            <p
              class="text-muted-foreground max-w-[28rem] text-sm leading-6 whitespace-normal"
            >
              {offer.details}
            </p>
          </Table.Cell>
          <Table.Cell>{formatDate(offer.starts_at)}</Table.Cell>
          <Table.Cell>{formatDate(offer.ends_at)}</Table.Cell>
          <Table.Cell>{formatDate(offer.created_at)}</Table.Cell>
          <Table.Cell>{formatDate(offer.updated_at)}</Table.Cell>
          {#if canEdit}
            <Table.Cell class="text-right">
              <Button
                variant="outline"
                size="sm"
                onclick={() => onEdit?.(offer)}
              >
                Edit
              </Button>
            </Table.Cell>
          {/if}
        </Table.Row>
      {/each}
    {:else}
      <Table.Row>
        <Table.Cell
          colspan={canEdit ? 12 : 11}
          class="text-muted-foreground py-12 text-center text-sm"
        >
          No offers matched these filters. Adjust the sidebar criteria or clear
          them to see everything again.
        </Table.Cell>
      </Table.Row>
    {/if}
  </Table.Body>
</Table.Root>
