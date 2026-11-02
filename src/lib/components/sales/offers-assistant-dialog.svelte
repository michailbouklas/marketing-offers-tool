<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { formatSalesCount } from "$lib/services/sales-dashboard";
  import {
    EXPLORE_OFFER_FILTER_MAX_ITEMS,
    EXPLORE_OFFER_OPTIONS_LIMIT,
    type ComboFilterMode,
    type ExploreOfferOption,
    type OfferFilter,
    type OfferFilterMode,
  } from "$lib/services/sales-explore";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    open = $bindable(false),
    endpoint,
    search,
    filter,
    current,
    onApply,
  }: {
    open: boolean;
    endpoint: string;
    /** URL query string (date window + brands). */
    search: string;
    /** The grid's current column filters (offers are listed within them). */
    filter: unknown;
    current: OfferFilter | null;
    onApply: (filter: OfferFilter | null) => void;
  } = $props();

  // "all" = no offer filter (only the combo part, if any, applies).
  const modes: { value: OfferFilterMode | "all"; label: string }[] = [
    { value: "all", label: "All orders" },
    { value: "with", label: "Only orders with" },
    { value: "without", label: "Exclude orders with" },
    { value: "any", label: "Any offer" },
    { value: "none", label: "No offer" },
  ];

  const comboModes: { value: ComboFilterMode | undefined; label: string }[] = [
    { value: undefined, label: "All orders" },
    { value: "only", label: "Only combo orders" },
    { value: "exclude", label: "No combo orders" },
  ];

  let mode = $state<OfferFilterMode | "all">("with");
  let combo = $state<ComboFilterMode | undefined>(undefined);
  // item code -> display name, kept across searches.
  let selected = $state<Map<string, string>>(new Map());
  let query = $state("");
  let options = $state<ExploreOfferOption[]>([]);
  let truncated = $state(false);
  let status = $state<"idle" | "loading" | "ready" | "failed">("idle");
  let latest = 0;

  const needsItems = $derived(mode === "with" || mode === "without");
  const unselectedMatches = $derived(
    options.filter((option) => !selected.has(option.item)),
  );
  const canApply = $derived(
    mode === "all"
      ? combo !== undefined
      : !needsItems ||
          (selected.size > 0 &&
            selected.size <= EXPLORE_OFFER_FILTER_MAX_ITEMS),
  );

  // Reset the draft to the applied filter each time the dialog opens.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      // A combo-only filter reopens on "All orders", a fresh dialog on picking.
      mode = current?.mode ?? (current ? "all" : "with");
      combo = current?.combo;
      const items = current?.items ?? [];
      // Keep the readable names from the last session if nothing changed.
      const same =
        items.length === selected.size &&
        items.every((item) => selected.has(item));
      if (!same) selected = new Map(items.map((item) => [item, item]));
      query = "";
      void load("");
    }
    wasOpen = open;
  });

  async function load(text: string) {
    const id = ++latest;
    status = "loading";
    try {
      const response = await fetch(`${endpoint}/offer-options${search}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ search: text, filter }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as {
        options: ExploreOfferOption[];
        truncated: boolean;
      };
      if (id !== latest) return;
      options = data.options;
      truncated = data.truncated;
      // Replace code placeholders for items selected before this list loaded.
      const names = new Map(selected);
      for (const option of data.options) {
        if (names.has(option.item)) names.set(option.item, option.name);
      }
      selected = names;
      status = "ready";
    } catch {
      if (id === latest) status = "failed";
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onSearch(value: string) {
    query = value;
    clearTimeout(timer);
    timer = setTimeout(() => load(value.trim()), 250);
  }

  function toggle(option: ExploreOfferOption) {
    const next = new Map(selected);
    if (next.has(option.item)) next.delete(option.item);
    else next.set(option.item, option.name);
    selected = next;
  }

  function selectAllMatches() {
    const next = new Map(selected);
    for (const option of options) next.set(option.item, option.name);
    selected = next;
  }

  function remove(item: string) {
    const next = new Map(selected);
    next.delete(item);
    selected = next;
  }

  function apply() {
    onApply({
      mode: mode === "all" ? undefined : mode,
      items: needsItems ? [...selected.keys()] : [],
      combo,
    });
    open = false;
  }

  function reset() {
    onApply(null);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Offers Assistant</Dialog.Title>
      <Dialog.Description>
        Filter the grid by the offers, coupons and combo meals in each order.
        The list shows offers in the current date range and column filters.
      </Dialog.Description>
    </Dialog.Header>

    <ButtonGroup.Root class="flex-wrap" aria-label="Offer filter mode">
      {#each modes as option (option.value)}
        <Button
          type="button"
          size="sm"
          variant={mode === option.value ? "default" : "outline"}
          aria-pressed={mode === option.value}
          onclick={() => (mode = option.value)}
        >
          {option.label}
        </Button>
      {/each}
    </ButtonGroup.Root>

    {#if needsItems}
      <div class="flex items-center gap-2">
        <Input
          placeholder="Find offers by name or code, e.g. 1 plus 1"
          aria-label="Find offers"
          value={query}
          oninput={(event) =>
            onSearch((event.currentTarget as HTMLInputElement).value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={unselectedMatches.length === 0}
          onclick={selectAllMatches}
        >
          Select all {options.length}
        </Button>
      </div>

      {#if selected.size > 0}
        <div class="flex max-h-24 shrink-0 flex-wrap gap-1 overflow-y-auto">
          {#each [...selected] as [item, name] (item)}
            <Badge variant="secondary" class="gap-1">
              <span class="max-w-56 truncate">{name}</span>
              <button
                type="button"
                class="hover:text-foreground rounded-sm"
                aria-label={`Remove ${name}`}
                onclick={() => remove(item)}
              >
                <XIcon class="size-3" />
              </button>
            </Badge>
          {/each}
        </div>
      {/if}

      <div
        class="min-h-40 flex-1 overflow-y-auto rounded-md border"
        role="group"
        aria-label="Offers"
      >
        {#if status === "loading"}
          <div class="flex justify-center py-8">
            <LoaderCircleIcon
              class="text-muted-foreground size-5 animate-spin"
            />
          </div>
        {:else if status === "failed"}
          <p class="text-destructive p-4 text-sm">Could not load offers.</p>
        {:else if options.length === 0}
          <p class="text-muted-foreground p-4 text-sm">
            No offers match in the current data.
          </p>
        {:else}
          {#each options as option (option.item)}
            <button
              type="button"
              class="hover:bg-accent/50 flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0"
              onclick={() => toggle(option)}
            >
              <Checkbox
                checked={selected.has(option.item)}
                class="pointer-events-none"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{option.name}</span>
                <span class="text-muted-foreground block truncate text-xs">
                  {option.item} · {option.category}
                </span>
              </span>
              <span class="text-muted-foreground shrink-0 text-xs">
                {formatSalesCount(option.orders)} orders
              </span>
            </button>
          {/each}
        {/if}
      </div>
      {#if truncated}
        <p class="text-muted-foreground text-xs">
          Showing the top {EXPLORE_OFFER_OPTIONS_LIMIT} offers by orders. Search to
          narrow.
        </p>
      {/if}
    {:else}
      <p class="text-muted-foreground text-sm">
        {mode === "all"
          ? "No offer filter: orders are shown whether or not they used an offer."
          : mode === "any"
            ? "Shows only orders that contain at least one offer or coupon."
            : "Shows only orders without any offer or coupon."}
      </p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-muted-foreground text-sm">Combo meals</span>
      <ButtonGroup.Root aria-label="Combo filter">
        {#each comboModes as option (option.label)}
          <Button
            type="button"
            size="sm"
            variant={combo === option.value ? "default" : "outline"}
            aria-pressed={combo === option.value}
            onclick={() => (combo = option.value)}
          >
            {option.label}
          </Button>
        {/each}
      </ButtonGroup.Root>
    </div>

    <Dialog.Footer class="gap-2 sm:justify-between">
      <Button type="button" variant="ghost" disabled={!current} onclick={reset}>
        Clear offer filter
      </Button>
      <div class="flex items-center gap-2">
        {#if needsItems}
          <span class="text-muted-foreground text-sm">
            {selected.size} selected
          </span>
        {/if}
        <Button type="button" disabled={!canApply} onclick={apply}>
          Apply
        </Button>
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
