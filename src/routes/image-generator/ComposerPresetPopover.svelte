<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import type { ComposerPresetDTO } from "$lib/services/image-generator/composer-library";

  interface Props {
    presets: ComposerPresetDTO[];
    onSave: (name: string) => Promise<void>;
    onUpdate: (preset: ComposerPresetDTO) => Promise<void>;
    onDelete: (preset: ComposerPresetDTO) => Promise<void>;
    onLoad: (preset: ComposerPresetDTO) => void;
  }

  let { presets, onSave, onUpdate, onDelete, onLoad }: Props = $props();

  let open = $state(false);
  let name = $state("");
  let busyId = $state<string | null>(null);
  let saving = $state(false);

  async function savePreset() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saving = true;
    try {
      await onSave(trimmed);
      name = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      saving = false;
    }
  }

  async function withPresetBusy(
    preset: ComposerPresetDTO,
    action: (preset: ComposerPresetDTO) => Promise<void>,
  ) {
    busyId = preset.id;
    try {
      await action(preset);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busyId = null;
    }
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger class={buttonVariants({ variant: "outline", size: "sm" })}>
    Presets
  </Popover.Trigger>
  <Popover.Content align="start" class="w-[24rem] p-0">
    <div class="grid gap-4 p-4">
      <div class="space-y-1">
        <p class="text-sm font-medium">Preset settings</p>
        <p class="text-muted-foreground text-xs">
          Save or load model settings. Prompts, references, and brand selection
          are excluded.
        </p>
      </div>

      <div class="grid gap-2">
        <Label for="preset-name" class="text-xs">Preset name</Label>
        <div class="flex gap-2">
          <Input
            id="preset-name"
            placeholder="e.g. Product square hero"
            bind:value={name}
          />
          <Button
            type="button"
            size="sm"
            onclick={savePreset}
            disabled={saving || name.trim().length === 0}
          >
            Save
          </Button>
        </div>
      </div>

      <div class="grid gap-2 border-t pt-3">
        {#if presets.length === 0}
          <p
            class="text-muted-foreground rounded-md border border-dashed p-3 text-sm"
          >
            No presets saved yet.
          </p>
        {:else}
          {#each presets as preset (preset.id)}
            <div class="rounded-lg border p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{preset.name}</p>
                  <p class="text-muted-foreground text-xs">
                    {preset.settings.models.length} model{preset.settings.models
                      .length === 1
                      ? ""
                      : "s"}, {preset.settings.size}
                  </p>
                </div>
                <Button type="button" size="sm" onclick={() => onLoad(preset)}>
                  Load
                </Button>
              </div>
              <div class="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId === preset.id}
                  onclick={() => withPresetBusy(preset, onUpdate)}
                >
                  Update
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyId === preset.id}
                  onclick={() => withPresetBusy(preset, onDelete)}
                >
                  Delete
                </Button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
