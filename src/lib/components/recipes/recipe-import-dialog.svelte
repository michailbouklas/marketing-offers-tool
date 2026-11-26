<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { readSse } from "$lib/sse-client";
  import { csvField } from "$lib/services/management-accounts";
  import {
    MAX_IMPORT_BYTES,
    STOCK_SUMMARY_SHEET,
    type ImportCase,
    type ImportCleanup,
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

  // Stock-summary imports: what happened to every Recipe ID of the sheet.
  let report = $state<ImportCase[]>([]);
  // Stored recipes the import found duplicated or no longer in the workbook.
  let cleanup = $state<ImportCleanup[]>([]);
  let cleaning = $state(false);

  async function deleteCleanup() {
    cleaning = true;
    try {
      const response = await fetch("/admin/recipes/import/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brand.alias,
          ids: cleanup.map((row) => row.id),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { deleted } = (await response.json()) as { deleted: number };
      toast.success(`Deleted ${deleted} recipe${deleted === 1 ? "" : "s"}.`);
      cleanup = [];
      await invalidateAll();
    } catch {
      toast.error("The recipes could not be deleted. Try again.");
    } finally {
      cleaning = false;
    }
  }
  let onlyAttention = $state(true);

  /** Recipe counts per status and reason, biggest first. */
  const reasons = $derived(
    [...Map.groupBy(report, (row) => `${row.status}: ${row.reason}`).entries()]
      .map(([label, rows]) => ({ label, count: rows.length }))
      .toSorted((a, b) => b.count - a.count),
  );
  // "Attention" = anything but a clean link: unlinked, skipped or with remarks.
  const shown = $derived(
    onlyAttention
      ? report.filter((row) => row.status !== "Linked" || row.notes)
      : report,
  );

  function downloadReport() {
    const rows = [
      [
        "Recipe ID",
        "First row",
        "Status",
        "Reason",
        "POS code",
        "POS item / look-alikes",
        "Materials",
        "Row remarks",
      ],
      ...report.map((row) => [
        row.name,
        row.row,
        row.status,
        row.reason,
        row.itemCode,
        row.posItem,
        row.materials,
        row.notes,
      ]),
    ];
    // BOM so Excel reads the UTF-8 (€, Greek) correctly.
    const csv =
      "﻿" + rows.map((row) => row.map(csvField).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `recipe-import-${brand.alias}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

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
      toast.error(
        `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB`,
      );
      return;
    }
    file = next;
    phase = "idle";
    errors = [];
    report = [];
    cleanup = [];
    message = "";
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (!running) pick(event.dataTransfer?.files[0]);
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
        report = event.report;
        cleanup = event.cleanup;
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
    report = [];
    cleanup = [];
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
      report = [];
      cleanup = [];
      message = "";
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-6xl">
    <Dialog.Header>
      <Dialog.Title>Import recipes · {brand.name}</Dialog.Title>
      <Dialog.Description>
        Reads the "{STOCK_SUMMARY_SHEET}" sheet of the cost workbook. Rows with
        the same Recipe ID form one recipe and replace it; recipes not in the
        file are left unchanged. A Recipe ID equal to one POS item name is
        linked to it. Cost always comes from SAP, not from the file.
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
      <p class="text-destructive text-sm font-medium" role="alert">
        {errors.length} problem{errors.length === 1 ? "" : "s"} found. Nothing was
        imported. Fix the file and start again.
      </p>
    {:else if phase === "error"}
      <p class="text-destructive text-sm" role="alert">{message}</p>
    {/if}

    {#if errors.length > 0}
      <div class="space-y-2">
        <div class="max-h-72 overflow-y-auto rounded-md border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Row</Table.Head>
                <Table.Head>Item</Table.Head>
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
    {/if}

    {#if phase === "done" && report.length > 0}
      <div class="space-y-2">
        <ul class="text-sm">
          {#each reasons as reason (reason.label)}
            <li>
              <span class="font-medium tabular-nums">{reason.count}</span>
              {reason.label}
            </li>
          {/each}
        </ul>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={onlyAttention}
            onclick={() => (onlyAttention = !onlyAttention)}
          >
            {onlyAttention ? "Show all recipes" : "Show only those to check"}
          </Button>
          <Button variant="outline" size="sm" onclick={downloadReport}>
            Download report (CSV)
          </Button>
          <span class="text-muted-foreground text-xs">
            {shown.length} of {report.length} recipes shown. The report is gone once
            this window closes; download it to keep it.
          </span>
        </div>
        <div class="max-h-80 overflow-y-auto rounded-md border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Recipe ID</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Reason</Table.Head>
                <Table.Head>POS item / look-alikes</Table.Head>
                <Table.Head class="text-right">Materials</Table.Head>
                <Table.Head>Row remarks</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each shown as row (row.name)}
                <Table.Row>
                  <Table.Cell class="whitespace-normal">{row.name}</Table.Cell>
                  <Table.Cell>{row.status}</Table.Cell>
                  <Table.Cell class="whitespace-normal">{row.reason}</Table.Cell
                  >
                  <Table.Cell class="whitespace-normal">
                    {#if row.itemCode}
                      <span class="font-mono text-xs">{row.itemCode}</span>
                    {/if}
                    {row.posItem}
                  </Table.Cell>
                  <Table.Cell class="text-right tabular-nums">
                    {row.materials}
                  </Table.Cell>
                  <Table.Cell class="text-xs whitespace-pre-line">
                    {row.notes}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      </div>
    {/if}

    {#if phase === "done" && cleanup.length > 0}
      <div class="space-y-2 rounded-md border border-amber-500/40 p-3">
        <p class="text-sm font-medium">
          {cleanup.length} stored recipe{cleanup.length === 1 ? "" : "s"} to review
        </p>
        <p class="text-muted-foreground text-xs">
          Duplicates of a recipe in this workbook, or recipes imported before
          that this workbook no longer has. Nothing was deleted.
        </p>
        <div class="max-h-48 overflow-y-auto rounded-md border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Recipe</Table.Head>
                <Table.Head>POS code</Table.Head>
                <Table.Head>Why</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each cleanup as row (row.id)}
                <Table.Row>
                  <Table.Cell class="whitespace-normal">{row.name}</Table.Cell>
                  <Table.Cell class="font-mono text-xs"
                    >{row.itemCode}</Table.Cell
                  >
                  <Table.Cell class="whitespace-normal">{row.reason}</Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={cleaning}
            onclick={deleteCleanup}
          >
            {cleaning ? "Deleting…" : `Delete ${cleanup.length}`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={cleaning}
            onclick={() => (cleanup = [])}
          >
            Keep them
          </Button>
        </div>
      </div>
    {/if}

    <Dialog.Footer class="gap-2">
      <Button disabled={!file || running} onclick={startImport}>
        {running ? "Importing…" : "Start import"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
