<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";

  type Option = { value: string; label: string };

  let {
    label,
    options,
    selected,
    noun,
    onApply,
  }: {
    label: string;
    options: Option[];
    /** Applied values; empty means "all". */
    selected: string[];
    /** Plural used in the trigger summary, e.g. "channels". */
    noun: string;
    onApply: (values: string[]) => void;
  } = $props();

  let open = $state(false);
  let draft = $state<string[]>([]);

  function onOpenChange(next: boolean) {
    if (next) draft = [...selected];
    open = next;
  }

  function toggle(value: string) {
    draft = draft.includes(value)
      ? draft.filter((item) => item !== value)
      : [...draft, value];
  }

  function apply() {
    open = false;
    // Every option ticked is the same as no filter; keep the URL short.
    onApply(draft.length === options.length ? [] : draft);
  }

  const summary = $derived.by(() => {
    if (selected.length === 0) return `All ${noun}`;
    if (selected.length === 1) {
      return (
        options.find((option) => option.value === selected[0])?.label ??
        selected[0]
      );
    }
    return `${selected.length} ${noun}`;
  });
</script>

<div class="space-y-2">
  <span class="text-sm font-medium">{label}</span>
  <Popover.Root {open} {onOpenChange}>
    <Popover.Trigger
      class={`${buttonVariants({ variant: "outline" })} flex min-w-44 justify-between`}
      aria-label={`${label}: ${summary}`}
    >
      <span class="truncate">{summary}</span>
      <ChevronsUpDownIcon class="size-4 opacity-60" />
    </Popover.Trigger>
    <Popover.Content align="start" class="w-72 p-0">
      <div class="flex items-center justify-between gap-2 border-b px-4 py-2">
        <button
          type="button"
          class="text-sm font-medium underline-offset-4 hover:underline"
          onclick={() => (draft = options.map((option) => option.value))}
        >
          Select all
        </button>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
          onclick={() => (draft = [])}
        >
          Select none
        </button>
      </div>
      <div class="max-h-72 overflow-y-auto p-2">
        {#each options as option (option.value)}
          <button
            type="button"
            role="checkbox"
            aria-checked={draft.includes(option.value)}
            class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm"
            onclick={() => toggle(option.value)}
          >
            <Checkbox
              checked={draft.includes(option.value)}
              class="pointer-events-none"
              tabindex={-1}
              aria-hidden="true"
            />
            {option.label}
          </button>
        {:else}
          <p class="text-muted-foreground px-3 py-2 text-sm">
            No {noun} in this range.
          </p>
        {/each}
      </div>
      <div class="flex items-center justify-between gap-2 border-t px-4 py-3">
        <p class="text-muted-foreground text-xs">
          {draft.length || "All"} / {options.length} selected
        </p>
        <Button type="button" size="sm" onclick={apply}>Apply</Button>
      </div>
    </Popover.Content>
  </Popover.Root>
</div>
