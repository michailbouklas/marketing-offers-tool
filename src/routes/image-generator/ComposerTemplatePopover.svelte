<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import type { BrandOption } from "$lib/services/brands";
  import type {
    ComposerTemplateDTO,
    TemplateVisibility,
  } from "$lib/services/image-generator/composer-library";

  interface Props {
    brands: BrandOption[];
    privateTemplates: ComposerTemplateDTO[];
    publicTemplates: ComposerTemplateDTO[];
    onSave: (input: {
      name: string;
      visibility: TemplateVisibility;
      brandIds: number[];
    }) => Promise<void>;
    onUpdate: (template: ComposerTemplateDTO) => Promise<void>;
    onDelete: (template: ComposerTemplateDTO) => Promise<void>;
    onLoad: (template: ComposerTemplateDTO) => void;
  }

  let {
    brands,
    privateTemplates,
    publicTemplates,
    onSave,
    onUpdate,
    onDelete,
    onLoad,
  }: Props = $props();

  let name = $state("");
  let visibility = $state<TemplateVisibility>("private");
  let selectedBrandIds = $state<number[]>([]);
  let brandOpen = $state(false);
  let saving = $state(false);
  let busyId = $state<string | null>(null);

  const brandSummary = $derived.by(() => {
    if (selectedBrandIds.length === 0) return "No brand scope";
    const labels = selectedBrandIds.map(
      (id) => brands.find((brand) => brand.id === id)?.name ?? String(id),
    );
    return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
  });

  function isBrandSelected(id: number): boolean {
    return selectedBrandIds.includes(id);
  }

  function toggleBrand(id: number) {
    selectedBrandIds = isBrandSelected(id)
      ? selectedBrandIds.filter((existing) => existing !== id)
      : [...selectedBrandIds, id];
  }

  async function saveTemplate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saving = true;
    try {
      await onSave({ name: trimmed, visibility, brandIds: selectedBrandIds });
      name = "";
      selectedBrandIds = [];
      visibility = "private";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      saving = false;
    }
  }

  async function withTemplateBusy(
    template: ComposerTemplateDTO,
    action: (template: ComposerTemplateDTO) => Promise<void>,
  ) {
    busyId = template.id;
    try {
      await action(template);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busyId = null;
    }
  }

  function templateBrandLabel(template: ComposerTemplateDTO): string {
    if (template.brands.length === 0) return "No brand scope";
    return template.brands.map((brand) => brand.name).join(", ");
  }
</script>

<Popover.Root>
  <Popover.Trigger class={buttonVariants({ variant: "outline", size: "sm" })}>
    Templates
  </Popover.Trigger>
  <Popover.Content align="start" class="w-[28rem] p-0">
    <div
      class="grid max-h-(--bits-floating-available-height) gap-4 overflow-y-auto p-4"
    >
      <div class="space-y-1">
        <p class="text-sm font-medium">Prompt templates</p>
        <p class="text-muted-foreground text-xs">
          Save prompt text with settings. References and active brand selection
          are excluded.
        </p>
      </div>

      <div class="grid gap-3 rounded-lg border p-3">
        <div class="grid gap-2">
          <Label for="template-name" class="text-xs">Template name</Label>
          <Input
            id="template-name"
            placeholder="e.g. Campaign launch visual"
            bind:value={name}
          />
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <div class="grid gap-1.5">
            <Label for="template-visibility" class="text-xs">Visibility</Label>
            <NativeSelect.Root id="template-visibility" bind:value={visibility}>
              <NativeSelect.Option value="private">Private</NativeSelect.Option>
              <NativeSelect.Option value="public">Public</NativeSelect.Option>
            </NativeSelect.Root>
          </div>

          <div class="grid gap-1.5">
            <Label id="template-brand-label" class="text-xs">Brands</Label>
            <Popover.Root bind:open={brandOpen}>
              <Popover.Trigger
                aria-labelledby="template-brand-label"
                class={`${buttonVariants({ variant: "outline" })} w-full justify-between font-normal`}
              >
                <span class="truncate">{brandSummary}</span>
                <ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" />
              </Popover.Trigger>
              <Popover.Content align="start" class="w-[20rem] p-0">
                <div class="border-b px-4 py-3">
                  <p class="text-sm font-medium">Template brands</p>
                  <p class="text-muted-foreground mt-1 text-xs">
                    Optional brand context for finding reusable templates.
                  </p>
                </div>
                <div class="max-h-64 overflow-y-auto px-2 py-2">
                  {#if brands.length === 0}
                    <p class="text-muted-foreground p-3 text-sm">
                      No assigned brands.
                    </p>
                  {:else}
                    {#each brands as brand (brand.id)}
                      <button
                        type="button"
                        class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                        onclick={() => toggleBrand(brand.id)}
                      >
                        <Checkbox
                          checked={isBrandSelected(brand.id)}
                          class="pointer-events-none"
                        />
                        <span class="truncate text-sm font-medium"
                          >{brand.name}</span
                        >
                      </button>
                    {/each}
                  {/if}
                </div>
                <div
                  class="flex items-center justify-between border-t px-4 py-3"
                >
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                    onclick={() => (selectedBrandIds = [])}
                  >
                    Clear
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    onclick={() => (brandOpen = false)}>Done</Button
                  >
                </div>
              </Popover.Content>
            </Popover.Root>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onclick={saveTemplate}
          disabled={saving || name.trim().length === 0}
        >
          Save template
        </Button>
      </div>

      <section class="grid gap-2 border-t pt-3">
        <div class="flex items-center gap-2">
          <p class="text-sm font-medium">Private templates</p>
          <Badge variant="secondary">Only you</Badge>
        </div>
        {#if privateTemplates.length === 0}
          <p
            class="text-muted-foreground rounded-md border border-dashed p-3 text-sm"
          >
            No private templates saved.
          </p>
        {:else}
          {#each privateTemplates as template (template.id)}
            <div class="rounded-lg border p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{template.name}</p>
                  <p class="text-muted-foreground truncate text-xs">
                    {templateBrandLabel(template)}
                  </p>
                </div>
                <Button type="button" size="sm" onclick={() => onLoad(template)}
                  >Load</Button
                >
              </div>
              <div class="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId === template.id}
                  onclick={() => withTemplateBusy(template, onUpdate)}
                  >Update</Button
                >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyId === template.id}
                  onclick={() => withTemplateBusy(template, onDelete)}
                  >Delete</Button
                >
              </div>
            </div>
          {/each}
        {/if}
      </section>

      <section class="grid gap-2 border-t pt-3">
        <div class="flex items-center gap-2">
          <p class="text-sm font-medium">Shared templates</p>
          <Badge variant="outline">Public</Badge>
        </div>
        {#if publicTemplates.length === 0}
          <p
            class="text-muted-foreground rounded-md border border-dashed p-3 text-sm"
          >
            No shared templates available.
          </p>
        {:else}
          {#each publicTemplates as template (template.id)}
            <div class="rounded-lg border p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{template.name}</p>
                  <p class="text-muted-foreground truncate text-xs">
                    By {template.ownerName} · {templateBrandLabel(template)}
                  </p>
                </div>
                <Button type="button" size="sm" onclick={() => onLoad(template)}
                  >Load</Button
                >
              </div>
              {#if template.ownedByCurrentUser}
                <div class="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === template.id}
                    onclick={() => withTemplateBusy(template, onUpdate)}
                    >Update</Button
                  >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === template.id}
                    onclick={() => withTemplateBusy(template, onDelete)}
                    >Delete</Button
                  >
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </section>
    </div>
  </Popover.Content>
</Popover.Root>
