<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatCompetitionDateTime } from "$lib/services/competition/competition";
  import type { PendingNotificationsResult } from "$lib/services/notifications/types";
  import BellIcon from "@lucide/svelte/icons/bell";

  let {
    title = "Your offer notifications",
    data,
  }: {
    title?: string;
    data: PendingNotificationsResult;
  } = $props();

  // The widget lists the most recent pending rows; `count` is the exact total,
  // so surface how many extra are queued beyond the visible list.
  const hiddenCount = $derived(Math.max(0, data.count - data.items.length));
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1.5">
        <Card.Title>{title}</Card.Title>
        <Card.Description>
          New offers on restaurants you monitor that haven't been emailed yet.
          They clear once the next digest sends.
        </Card.Description>
      </div>
      {#if data.count > 0}
        <Badge class="shrink-0 gap-1">
          <BellIcon class="size-3.5" />
          {data.count}
        </Badge>
      {/if}
    </div>
  </Card.Header>
  <Card.Content>
    {#if data.items.length === 0}
      <p class="text-muted-foreground text-sm">
        You're all caught up — no unsent notifications.
      </p>
    {:else}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>When</Table.Head>
            <Table.Head>Offer</Table.Head>
            <Table.Head>Restaurant</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.items as item (item.id)}
            <Table.Row>
              <Table.Cell class="text-muted-foreground whitespace-nowrap">
                {formatCompetitionDateTime(item.createdAt)}
              </Table.Cell>
              <Table.Cell class="max-w-64 truncate font-medium">
                {item.title}
              </Table.Cell>
              <Table.Cell class="max-w-48 truncate">
                {item.restaurantName ?? "—"}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
      {#if hiddenCount > 0}
        <p class="text-muted-foreground mt-3 text-xs">
          + {hiddenCount} more pending.
        </p>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
