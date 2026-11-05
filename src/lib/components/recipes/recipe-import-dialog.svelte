<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { readSse } from "$lib/sse-client";
  import {
    MAX_IMPORT_BYTES,
    type ImportError,
    type ImportProgress,
    type RecipeImportEvent,
  } from "$lib/services/recipe-import";
  import { toast } from "svelte-sonner";

  let {
    open = $bindable(false),
    brand,
  }: { open?: boolean; brand: { alias: string; name: string } } = $props();

  type Phase =
    | "idle"
    | "validating"
    | "invalid"
    | "importing"
    | "done"
    | "error";

  let file = $state<File | null>(null);
  let dragging = $state(false);
  let phase = $state<Phase>("idle");
  let errors = $state<ImportError[]>([]);
  let progress = $state<ImportProgress>({ done: 0, total: 0, current: null });
  let message = $state("");
  let downloading = $state(false);

  const running = $derived(phase === "validating" || phase === "importing");
  const percent = $derived(
    progress.total ? Math.round((progress.done / progress.total) * 100) : 0,
  );

  function pick(next: File | undefined) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Only .xlsx files are supported");
      return;
    }
    if (next.size > MAX_IMPORT_BYTES) {
      toast.error("The file is larger than 5 MB");
      return;
    }
    file = next;
    phase = "idle";
    errors = [];
    message = "";
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (!running) pick(event.dataTransfer?.files[0]);
  }

  async function downloadTemplate() {
    downloading = true;
    try {
      const response = await fetch(
        `/admin/recipes/import/template?brand=${encodeURIComponent(brand.alias)}`,
      );
      if (!response.ok) throw new Error();
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch {
      toast.error("The template could not be generated. Try again.");
    } finally {
      downloading = false;
    }
  }

  function apply(event: RecipeImportEvent) {
    switch (event.type) {
      case "validating":
        phase = "validating";
        break;
      case "invalid":
        phase = "invalid";
        errors = event.errors;
        break;
      case "progress":
        phase = "importing";
        progress = event;
        break;
      case "done":
        phase = "done";
        message = `Imported ${event.imported} recipes.`;
        break;
      case "error":
        phase = "error";
        message = event.message;
        break;
    }
  }

  async function startImport() {
    if (!file) return;
    phase = "validating";
    errors = [];
    message = "";
    progress = { done: 0, total: 0, current: null };

    const body = new FormData();
    body.set("brand", brand.alias);
    body.set("file", file);
    try {
      const response = await fetch("/admin/recipes/import", {
        method: "POST",
        body,
      });
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        let detail = text;
        try {
          detail = (JSON.parse(text) as { message?: string }).message ?? text;
        } catch {
          // Plain-text error body.
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }
      for await (const event of readSse<RecipeImportEvent>(response.body)) {
        apply(event);
      }
      if (running)
        throw new Error("The connection closed before the import finished");
    } catch (cause) {
      phase = "error";
      message = cause instanceof Error ? cause.message : String(cause);
    }
    // Writing started (progress arrived): reload costs, even after an error.
    if (progress.total > 0) await invalidateAll();
  }

  $effect(() => {
    if (!open && !running) {
      file = null;
      phase = "idle";
      errors = [];
      message = "";
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>Import recipes · {brand.name}</Dialog.Title>
      <Dialog.Description>
        One row per ingredient. Rows with the same item code form one recipe and
        replace that item's current recipe. Items not in the file are left
        unchanged.
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
      ondrop={onDrop}
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

    {#if phase === "validating"}
      <p class="text-muted-foreground text-sm" role="status">
        Checking every row against the menu and SAP…
      </p>
    {:else if phase === "importing" || phase === "done"}
      <div class="space-y-2" role="status" aria-live="polite">
        <Progress value={percent} aria-label="Import progress" />
        <div
          class="text-muted-foreground flex flex-wrap justify-between gap-2 text-sm"
        >
          <span class="tabular-nums">
            {percent}% · {progress.total - progress.done} remaining
          </span>
          {#if progress.current}
            <span>
              Now: <span class="font-mono text-xs"
                >{progress.current.itemCode}</span
              >
              {progress.current.description}
            </span>
          {/if}
        </div>
        {#if phase === "done"}
          <p class="text-sm font-medium">{message}</p>
        {/if}
      </div>
    {:else if phase === "invalid"}
      <div class="space-y-2">
        <p class="text-destructive text-sm font-medium" role="alert">
          {errors.length} problem{errors.length === 1 ? "" : "s"} found. Nothing was
          imported. Fix the file and start again.
        </p>
        <div class="max-h-72 overflow-y-auto rounded-md border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Row</Table.Head>
                <Table.Head>Item code</Table.Head>
                <Table.Head>Column</Table.Head>
                <Table.Head>Problem</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each errors as problem, index (index)}
                <Table.Row>
                  <Table.Cell class="tabular-nums">{problem.row}</Table.Cell>
                  <Table.Cell class="font-mono text-xs">
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
      </div>
    {:else if phase === "error"}
      <p class="text-destructive text-sm" role="alert">{message}</p>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button
        variant="outline"
        class="sm:mr-auto"
        disabled={downloading}
        onclick={downloadTemplate}
      >
        {downloading ? "Preparing…" : "Download template"}
      </Button>
      <Button disabled={!file || running} onclick={startImport}>
        {running ? "Importing…" : "Start import"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
