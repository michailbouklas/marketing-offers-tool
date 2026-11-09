<script lang="ts">
  import "@gp-grid/vue/dist/styles.css";
  import type { CellRendererParams, GpGridProps, GridCore } from "@gp-grid/vue";
  import { mode } from "mode-watcher";
  import { onMount, untrack } from "svelte";
  import {
    formatAccounting,
    type MarketingCostTable,
  } from "$lib/services/management-accounts";

  let {
    table,
    onOpenAccount,
  }: {
    table: MarketingCostTable;
    /** Account cell click: open the drill-down for this GL account code. */
    onOpenAccount?: (code: string) => void;
  } = $props();

  type Row = Record<string, string | number>;

  // One row per GL account; year values keyed `y2026` etc.
  const rows = $derived(
    table.groups.flatMap((group) =>
      group.accounts.map((account) => ({
        group: group.name,
        code: account.code,
        account: account.name,
        ...Object.fromEntries(
          table.years.map((year, index) => [`y${year}`, account.values[index]]),
        ),
      })),
    ),
  );

  let container: HTMLDivElement;
  // Vue-reactive props object of the mounted <GpGrid>; set once mounted.
  let gridProps: GpGridProps<Row> | undefined;
  let getCore: (() => GridCore | undefined) | undefined;

  /** Account codes of the rows on screen: after the grid filters and sort. */
  export function visibleCodes(): string[] {
    const core = getCore?.();
    if (!core) return [];
    const codes: string[] = [];
    for (let row = 0; row < core.rows.getCount(); row++) {
      const code = (core.rows.getData(row) as Row | undefined)?.code;
      if (code !== undefined) codes.push(String(code));
    }
    return codes;
  }

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

      gridProps = vue.reactive<GpGridProps<Row>>({
        columns: [
          {
            field: "group",
            colId: "group",
            headerName: "Group",
            width: 240,
            cellDataType: "text" as const,
            pinned: "start" as const,
          },
          {
            field: "code",
            colId: "code",
            headerName: "Account code",
            width: 130,
            cellDataType: "text" as const,
          },
          {
            field: "account",
            colId: "account",
            headerName: "Account",
            width: 300,
            cellDataType: "text" as const,
            cellRenderer: (params: CellRendererParams<Row>) =>
              vue.h(
                "button",
                {
                  type: "button",
                  class:
                    "w-full truncate text-left underline-offset-4 hover:underline",
                  "aria-haspopup": "dialog",
                  title: "Explore this account",
                  onClick: () => {
                    const code = params.rowData?.code;
                    if (code !== undefined) onOpenAccount?.(String(code));
                  },
                },
                String(params.value ?? ""),
              ),
          },
          ...table.years.map((year) => ({
            field: `y${year}`,
            colId: `y${year}`,
            headerName: String(year),
            width: 130,
            cellDataType: "number" as const,
            valueFormatter: (value: unknown) => formatAccounting(Number(value)),
          })),
        ].map((column) => ({ ...column, sortable: true, filterable: true })),
        rowData: $state.snapshot(rows) as Row[],
        rowHeight: 34,
        sortingEnabled: true,
        darkMode: mode.current === "dark",
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
      app.mount(container);
      unmount = () => app.unmount();
    })();

    return () => {
      disposed = true;
      unmount?.();
    };
  });

  // Company change re-runs the load: hand the grid the new rows.
  $effect(() => {
    const next = $state.snapshot(rows) as Row[];
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
