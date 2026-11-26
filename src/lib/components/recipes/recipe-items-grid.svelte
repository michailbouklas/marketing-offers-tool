<script lang="ts" module>
  import type { RecipeRow } from "$lib/services/recipes";

  /** A `/admin/recipes` row plus what the page works out in the browser. */
  export type RecipeGridRow = RecipeRow & {
    /** Food cost % (prime cost % with labour on); null when not computable. */
    cost_percent: number | null;
    /** Cost % above the brand target. */
    over_target: boolean;
  };
</script>

<script lang="ts">
  import "@gp-grid/vue/dist/styles.css";
  import type { CellRendererParams, GpGridProps, GridCore } from "@gp-grid/vue";
  import { mode } from "mode-watcher";
  import { onMount, untrack } from "svelte";
  import { formatEur, type RecipeColumnState } from "$lib/services/recipes";

  let {
    rows,
    onOpen,
    visibleCount = $bindable(rows.length),
    columnState = null,
  }: {
    rows: RecipeGridRow[];
    /** Name click on a row. */
    onOpen?: (row: RecipeGridRow) => void;
    /** Rows left after the grid's own column filters. */
    visibleCount?: number;
    /** Saved column layout from user.meta; null = defaults. */
    columnState?: RecipeColumnState | null;
  } = $props();

  let container: HTMLDivElement;
  // Vue-reactive props object of the mounted <GpGrid>; set once mounted.
  let gridProps: GpGridProps<RecipeGridRow> | undefined;
  let getCore: (() => GridCore | undefined) | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  // Persist the layout after the user stops moving / resizing / pinning.
  function saveLayoutSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const state = getCore?.()?.columns.getState();
      if (!state) return;
      const columns = state.map((column) => ({
        columnId: column.columnId,
        width: column.width ?? null,
        order: column.order,
        pinned: column.pinned,
        hidden: column.hidden,
      }));
      // A preference, not data: a failed save is not worth interrupting for.
      void fetch("/admin/recipes/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns }),
      }).catch(() => {});
    }, 500);
  }

  /** Row keys on screen: after the grid filters and sort. */
  export function visibleKeys(): string[] {
    const core = getCore?.();
    if (!core) return [];
    const keys: string[] = [];
    for (let row = 0; row < core.rows.getCount(); row++) {
      const key = (core.rows.getData(row) as RecipeGridRow | undefined)?.key;
      if (key !== undefined) keys.push(key);
    }
    return keys;
  }

  const eur = (value: unknown) =>
    value === null || value === undefined ? "" : formatEur(Number(value));

  onMount(() => {
    let unmount: (() => void) | undefined;
    let disposed = false;

    (async () => {
      // Vue + gp-grid stay out of SSR and out of every other route's bundle.
      const [vue, gp] = await Promise.all([
        import("vue"),
        import("@gp-grid/vue"),
      ]);
      if (disposed) return;

      const text = (
        field: keyof RecipeGridRow,
        headerName: string,
        width: number,
      ) => ({
        field,
        colId: field,
        headerName,
        width,
        cellDataType: "text" as const,
      });
      const number = (
        field: keyof RecipeGridRow,
        headerName: string,
        valueFormatter?: (value: unknown) => string,
      ) => ({
        field,
        colId: field,
        headerName,
        width: 120,
        cellDataType: "number" as const,
        ...(valueFormatter && { valueFormatter }),
      });

      gridProps = vue.reactive<GpGridProps<RecipeGridRow>>({
        columns: [
          {
            ...text("name", "Recipe / item", 300),
            pinned: "start" as const,
            cellRenderer: (params: CellRendererParams<RecipeGridRow>) =>
              vue.h(
                "button",
                {
                  type: "button",
                  class:
                    "w-full truncate text-left underline-offset-4 hover:underline",
                  "aria-haspopup":
                    params.rowData?.id === null ? undefined : "dialog",
                  title:
                    params.rowData?.id === null
                      ? "Build a recipe for this POS item"
                      : "Show materials and cost breakdown",
                  onClick: () => {
                    if (params.rowData) onOpen?.(params.rowData);
                  },
                },
                String(params.value ?? ""),
              ),
          },
          {
            ...text("status", "Status", 130),
            // Fixed list: otherwise gp-grid offers only the values left after
            // the current filters, so once one status is picked the others
            // vanish from the popup.
            distinctValues: ["Linked", "Unlinked", "Ambiguous", "No recipe"],
          },
          text("item_code", "POS code", 170),
          text("pos_name", "POS name", 240),
          text("category", "Category", 180),
          number("materials", "Materials"),
          number("missing", "No cost"),
          number("cost", "Cost", eur),
          number("price", "POS price", eur),
          {
            ...number("cost_percent", "Cost %"),
            cellRenderer: (params: CellRendererParams<RecipeGridRow>) => {
              const row = params.rowData;
              if (row?.no_pos_price) {
                return vue.h(
                  "span",
                  { class: "text-muted-foreground text-xs" },
                  "no POS price",
                );
              }
              if (row?.cost_percent == null) return "";
              return vue.h(
                "span",
                {
                  class: row.over_target
                    ? "text-destructive font-medium"
                    : undefined,
                },
                `${row.cost_percent.toFixed(1)}%`,
              );
            },
          },
          text("updated", "Updated", 120),
        ].map((column) => ({ ...column, sortable: true, filterable: true })),
        rowData: $state.snapshot(rows) as RecipeGridRow[],
        rowHeight: 34,
        sortingEnabled: true,
        darkMode: mode.current === "dark",
        // Saved layout; gp-grid merges it, so columns added later still show.
        ...(columnState
          ? { columnState: columnState.map((c) => ({ ...c })) }
          : {}),
        onColumnMoved: saveLayoutSoon,
        onColumnResized: saveLayoutSoon,
        onColumnPinned: saveLayoutSoon,
      });

      const gridRef = vue.shallowRef<{ core: unknown } | null>(null);
      getCore = () => {
        // The exposed `core` may arrive as a ref or already unwrapped.
        const exposed = gridRef.value?.core as
          | { value?: GridCore }
          | GridCore
          | undefined;
        return exposed && "value" in exposed
          ? exposed.value
          : (exposed as GridCore | undefined);
      };

      const app = vue.createApp({
        render: () =>
          vue.h(gp.GpGrid, { ...(gridProps as object), ref: gridRef } as never),
      });
      // The grid re-loads its rows after every filter (and new rowData) and
      // announces the count in a DATA_LOADED instruction.
      const stopCount = vue.watchEffect((onCleanup) => {
        const core = getCore?.();
        if (!core) return;
        visibleCount = core.rows.getCount();
        onCleanup(
          core.onBatchInstruction((instructions) => {
            for (const instruction of instructions) {
              if (instruction.type === "DATA_LOADED") {
                visibleCount = instruction.totalRows;
              }
            }
          }),
        );
      });
      app.mount(container);
      unmount = () => {
        stopCount();
        app.unmount();
      };
    })();

    return () => {
      disposed = true;
      clearTimeout(saveTimer);
      unmount?.();
    };
  });

  // Brand change, the page toggles or a finished import: hand over the rows.
  $effect(() => {
    const next = $state.snapshot(rows) as RecipeGridRow[];
    untrack(() => {
      if (gridProps) gridProps.rowData = next;
    });
  });

  $effect(() => {
    const dark = mode.current === "dark";
    untrack(() => {
      if (gridProps) gridProps.darkMode = dark;
    });
  });
</script>

<div bind:this={container} class="h-full w-full"></div>
