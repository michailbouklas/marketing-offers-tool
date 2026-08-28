<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Command from "$lib/components/ui/command/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import type { ForecastLocation } from "$lib/services/forecasts/forecast-types";
  import { cn } from "$lib/utils.js";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import MapPinIcon from "@lucide/svelte/icons/map-pin";
  import { tick } from "svelte";

  /**
   * shadcn-svelte combobox (Popover + Command) over a brand's locations.
   * `null` = every location of the brand, which is also the default and the
   * state shown while the list is empty or still unknown.
   */
  let {
    locations,
    value,
    disabled = false,
    id,
    onSelect,
  }: {
    locations: ForecastLocation[];
    /** Selected `tran_location` id, or null for all locations. */
    value: number | null;
    disabled?: boolean;
    id?: string;
    onSelect: (locationId: number | null) => void;
  } = $props();

  const ALL_LOCATIONS_VALUE = "__all__";

  let open = $state(false);
  let triggerRef = $state<HTMLButtonElement>(null!);

  const selected = $derived(
    locations.find((location) => location.id === value) ?? null,
  );
  const label = $derived(selected?.name ?? "All locations");

  // Refocus the trigger after choosing so keyboard users can continue
  // through the rest of the controls (shadcn-svelte combobox pattern).
  function choose(next: number | null) {
    onSelect(next);
    open = false;
    void tick().then(() => triggerRef?.focus());
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger bind:ref={triggerRef} {id}>
    {#snippet child({ props })}
      <Button
        variant="outline"
        class="w-60 justify-between font-normal"
        {...props}
        {disabled}
        role="combobox"
        aria-expanded={open}
        aria-label="Location"
      >
        <span class="flex min-w-0 items-center gap-2">
          <MapPinIcon class="size-4 shrink-0 opacity-60" />
          <span class="truncate">{label}</span>
        </span>
        <ChevronsUpDownIcon class="ms-2 size-4 shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-72 p-0" align="start">
    <Command.Root>
      <Command.Input placeholder="Search locations…" />
      <Command.List>
        <Command.Empty>No location matches.</Command.Empty>
        <Command.Group>
          <Command.Item
            value={ALL_LOCATIONS_VALUE}
            onSelect={() => choose(null)}
          >
            <CheckIcon
              class={cn("me-2 size-4", value !== null && "text-transparent")}
            />
            All locations
          </Command.Item>
          {#each locations as location (location.id)}
            <Command.Item
              value={`${location.name} ${location.id}`}
              onSelect={() => choose(location.id)}
            >
              <CheckIcon
                class={cn(
                  "me-2 size-4",
                  value !== location.id && "text-transparent",
                )}
              />
              <span class="truncate">{location.name}</span>
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
