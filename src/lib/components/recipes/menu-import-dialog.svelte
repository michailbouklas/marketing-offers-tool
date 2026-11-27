<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    MAX_MENU_IMPORT_BYTES,
    MENU_SHEET_COLUMNS,
    MENU_SIZES,
    type MenuImportResult,
  } from "$lib/services/menu";
  import type { ImportError } from "$lib/services/recipe-import";
  import { toast } from "svelte-sonner";

  let {
    open = $bindable(false),
    brand,
  }: { open?: boolean; brand: { alias: string; name: string } } = $props();

  let file = $state<File | null>(null);
  let dragging = $state(false);
  let running = $state(false);
  let errors = $state<ImportError[]>([]);
  let message = $state("");

  function pick(next: File | undefined) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Only .xlsx files are supported");
      return;
    }
    if (next.size > MAX_MENU_IMPORT_BYTES) {
      toast.error(
        `The file is larger than ${MAX_MENU_IMPORT_BYTES / 1024 / 1024} MB`,
      );
      return;
    }
    file = next;
    errors = [];
    message = "";
  }

  async function startImport() {
    if (!file) return;
    running = true;
    errors = [];
    message = "";
    const body = new FormData();
    body.set("brand", brand.alias);
    body.set("file", file);
    try {
      const response = await fetch("/admin/recipes/menu/import", {
        method: "POST",
        body,
      });
      const result = (await response.json().catch(() => null)) as
        | (Partial<MenuImportResult> & {
            errors?: ImportError[];
            message?: string;
          })
        | null;
      if (!response.ok) {
        throw new Error(result?.message ?? `HTTP ${response.status}`);
      }
      if (result?.errors) {
        errors = result.errors;
        return;
      }
      toast.success(
        `Imported: ${result?.created ?? 0} new, ${result?.updated ?? 0} updated.`,
      );
      await invalidateAll();
      open = false;
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    } finally {
      running = false;
    }
  }

  $effect(() => {
    if (!open && !running) {
      file = null;
      errors = [];
      message = "";
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>Import menu · {brand.name}</Dialog.Title>
      <Dialog.Description>
        Reads the first sheet: one row per recipe or SAP material of a menu
        item, columns {Object.values(MENU_SHEET_COLUMNS).join(", ")}. Leave
        "Menu item" blank to add another line to the item above. Type is Menu
        Item or LTO; a meal (Meal = Yes) needs a Size ({MENU_SIZES.join(", ")}).
        "Recipe or material" is a recipe name, its POS code, or a SAP item
        number (quantity in its purchasing unit). Net selling price is
        calculated from Price and ignored on import. Menu items with the same
        name are replaced, others are created; items not in the file stay as
        they are. Any problem stops the whole import. Start from "Download
        template": it holds the current menu and the list of recipe names.
      </Dialog.Description>
    </Dialog.Header>

    <label
      class={[
        "focus-within:ring-ring flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-8 text-center text-sm transition-colors focus-within:ring-2",
        dragging ? "border-primary bg-muted" : "border-muted-foreground/25",
        running && "pointer-events-none opacity-50",
      ]}
      ondragover={(event) => {
        event.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={(event) => {
        event.preventDefault();
        dragging = false;
        if (!running) pick(event.dataTransfer?.files[0]);
      }}
    >
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        class="sr-only"
        disabled={running}
        onchange={(event) => {
          pick(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {#if file}
        <span class="font-medium">{file.name}</span>
        <span class="text-muted-foreground text-xs">
          Drop or click to choose another file
        </span>
      {:else}
        <span class="font-medium">Drop the Excel file here</span>
        <span class="text-muted-foreground text-xs">
          or click to choose a .xlsx file
        </span>
      {/if}
    </label>

    {#if message}
      <p class="text-destructive text-sm" role="alert">{message}</p>
    {/if}
    {#if errors.length > 0}
      <p class="text-destructive text-sm font-medium" role="alert">
        {errors.length} problem{errors.length === 1 ? "" : "s"} found. Nothing was
        imported. Fix the file and start again.
      </p>
      <div class="max-h-72 overflow-y-auto rounded-md border">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Row</Table.Head>
              <Table.Head>Menu item</Table.Head>
              <Table.Head>Column</Table.Head>
              <Table.Head>Problem</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each errors as problem, index (index)}
              <Table.Row>
                <Table.Cell class="tabular-nums">{problem.row}</Table.Cell>
                <Table.Cell class="whitespace-normal">
                  {problem.itemCode}
                </Table.Cell>
                <Table.Cell>{problem.column}</Table.Cell>
                <Table.Cell class="whitespace-normal">
                  {problem.message}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}

    <Dialog.Footer>
      <Button disabled={!file || running} onclick={startImport}>
        {running ? "Importing…" : "Start import"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
