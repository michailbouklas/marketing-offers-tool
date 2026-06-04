<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    value: string[];
    suggestions?: readonly string[];
    placeholder?: string;
    id?: string;
  }

  let {
    value = $bindable(),
    suggestions = [],
    placeholder = "Type and press Enter…",
    id,
  }: Props = $props();

  let draft = $state("");

  const remainingSuggestions = $derived(
    suggestions.filter((s) => !value.includes(s)),
  );

  function add(entry: string) {
    const trimmed = entry.trim();
    if (trimmed === "" || value.includes(trimmed)) return;
    value = [...value, trimmed];
  }

  function remove(entry: string) {
    value = value.filter((v) => v !== entry);
  }

  function commitDraft() {
    // Support comma-separated paste ("steam, crumbs") in one commit.
    for (const part of draft.split(",")) {
      add(part);
    }
    draft = "";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      value = value.slice(0, -1);
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#if value.length > 0}
    <div class="flex flex-wrap gap-1.5">
      {#each value as entry (entry)}
        <span
          class="bg-secondary text-secondary-foreground inline-flex h-7 items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-xs font-medium"
        >
          {entry}
          <button
            type="button"
            aria-label={`Remove ${entry}`}
            title="Remove"
            class="hover:bg-background/60 flex size-5 items-center justify-center rounded-full transition-colors"
            onclick={() => remove(entry)}
          >
            <XIcon class="size-3.5" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <Input
    {id}
    {placeholder}
    bind:value={draft}
    onkeydown={handleKeydown}
    onblur={() => {
      if (draft.trim() !== "") commitDraft();
    }}
  />

  {#if remainingSuggestions.length > 0}
    <div class="flex flex-wrap gap-1.5">
      {#each remainingSuggestions as suggestion (suggestion)}
        <button
          type="button"
          class="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-6 items-center rounded-full border border-dashed px-2.5 text-xs transition-colors"
          onclick={() => add(suggestion)}
        >
          + {suggestion}
        </button>
      {/each}
    </div>
  {/if}
</div>
