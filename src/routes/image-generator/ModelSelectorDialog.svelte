<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "$lib/components/ui/native-select/index.js";
  import type {
    ImageGeneratorConfig,
    ImageProviderId,
  } from "$lib/services/image-providers/config";
  import {
    modelCapabilityBadges,
    splitModelId,
  } from "$lib/services/image-providers/model-display";

  interface Props {
    open: boolean;
    config: ImageGeneratorConfig;
    provider: ImageProviderId;
    selectedModels: string[];
  }

  let {
    open = $bindable(),
    config,
    provider = $bindable(),
    selectedModels = $bindable(),
  }: Props = $props();

  let search = $state("");

  const providerModels = $derived(
    config.providers.find((p) => p.id === provider)?.models ?? [],
  );

  const filteredModels = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providerModels;
    return providerModels.filter((m) => m.id.toLowerCase().includes(q));
  });

  const allSelected = $derived(
    providerModels.length > 0 &&
      selectedModels.length === providerModels.length,
  );

  function isSelected(id: string): boolean {
    return selectedModels.includes(id);
  }

  function toggle(id: string) {
    selectedModels = isSelected(id)
      ? selectedModels.filter((m) => m !== id)
      : [...selectedModels, id];
  }

  function selectAll() {
    selectedModels = providerModels.map((m) => m.id);
  }

  function clear() {
    selectedModels = [];
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Select models</Dialog.Title>
      <Dialog.Description>
        Generate one batch per selected model. Pick at least one.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3">
      <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input placeholder="Search models…" bind:value={search} />
        {#if config.providers.length > 1}
          <NativeSelect aria-label="Provider" bind:value={provider}>
            {#each config.providers as p (p.id)}
              <NativeSelectOption value={p.id}>{p.id}</NativeSelectOption>
            {/each}
          </NativeSelect>
        {/if}
      </div>

      <div class="flex items-center justify-between gap-2">
        <Label class="text-muted-foreground text-xs font-medium">
          {selectedModels.length} selected
        </Label>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-sm font-medium underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            disabled={providerModels.length === 0 || allSelected}
            onclick={selectAll}
          >
            Select all
          </button>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedModels.length === 0}
            onclick={clear}
          >
            Clear
          </button>
        </div>
      </div>

      <div class="max-h-80 overflow-y-auto rounded-md border">
        {#if providerModels.length === 0}
          <p class="text-muted-foreground px-3 py-6 text-center text-sm">
            No models configured for this provider.
          </p>
        {:else if filteredModels.length === 0}
          <p class="text-muted-foreground px-3 py-6 text-center text-sm">
            No models match "{search}".
          </p>
        {:else}
          {#each filteredModels as model (model.id)}
            {@const parts = splitModelId(model.id)}
            {@const badges = modelCapabilityBadges(model)}
            <button
              type="button"
              class="hover:bg-accent/50 flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0"
              onclick={() => toggle(model.id)}
            >
              <Checkbox
                checked={isSelected(model.id)}
                class="pointer-events-none"
              />
              <span class="min-w-0 flex-1 truncate text-sm leading-tight">
                {#if parts.org}
                  <span class="text-muted-foreground">{parts.org}/</span>
                {/if}
                <span class="font-medium">{parts.name}</span>
              </span>
              {#each badges as badge (badge)}
                <Badge variant="secondary">{badge}</Badge>
              {/each}
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <Dialog.Footer>
      <Button type="button" onclick={() => (open = false)}>Done</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
