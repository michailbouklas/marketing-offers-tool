<script lang="ts" generics="T extends object">
  import type { Snippet } from "svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import type { WidgetResult } from "$lib/dashboard/widgets";

  let {
    title,
    description,
    result,
    editing,
    onsettings,
    onduplicate,
    onremove,
    emptyMessage = "No brands are assigned to you.",
    children,
  }: {
    title: string;
    description: string;
    result: Promise<WidgetResult<T | null>> | undefined;
    editing: boolean;
    /** Omitted for widgets without settings. */
    onsettings?: () => void;
    /** Omitted for widgets without settings (a copy could not differ). */
    onduplicate?: () => void;
    onremove: () => void;
    emptyMessage?: string;
    children: Snippet<[T]>;
  } = $props();
</script>

<Card.Root class="h-full gap-3 py-4">
  <Card.Header class="flex items-start gap-2 px-4">
    {#if editing}
      <GripVerticalIcon
        class="text-muted-foreground mt-0.5 size-4 shrink-0 cursor-grab"
        aria-hidden="true"
      />
    {/if}
    <div class="min-w-0 flex-1 space-y-1">
      <Card.Title class="text-sm">{title}</Card.Title>
      <Card.Description class="text-xs">{description}</Card.Description>
    </div>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={buttonVariants({ variant: "ghost", size: "icon" })}
        aria-label={`${title} options`}
      >
        <EllipsisIcon class="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {#if onsettings}
          <DropdownMenu.Item onSelect={onsettings}>Settings</DropdownMenu.Item>
        {/if}
        {#if onduplicate}
          <DropdownMenu.Item onSelect={onduplicate}>Duplicate</DropdownMenu.Item
          >
        {/if}
        <DropdownMenu.Item onSelect={onremove}>Remove</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Card.Header>

  <Card.Content class="flex-1 px-4">
    {#await result}
      <div class="space-y-2" aria-busy="true">
        <Skeleton class="h-6 w-1/3" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-2/3" />
      </div>
    {:then loaded}
      {#if !loaded || loaded.error}
        <p class="text-destructive text-sm">
          {loaded?.error ?? "Could not load this widget."}
        </p>
      {:else if loaded.data === null}
        <p class="text-muted-foreground text-sm">{emptyMessage}</p>
      {:else}
        {@const href = "href" in loaded.data ? String(loaded.data.href) : null}
        {@render children(loaded.data)}
        {#if href}
          <div class="mt-3 flex justify-end">
            <Button {href} variant="link" size="sm" class="px-0">
              Show all
              <ArrowRightIcon class="size-4" />
            </Button>
          </div>
        {/if}
      {/if}
    {/await}
  </Card.Content>
</Card.Root>
