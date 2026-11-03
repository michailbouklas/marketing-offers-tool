<script lang="ts">
  import "@gp-grid/vue/dist/styles.css";
  import {
    EXPLORE_COLUMNS,
    EXPLORE_PAGE_MAX_ROWS,
    serializeGridFilter,
    type ExploreColumnState,
    type ExploreFilter,
    type ExploreGridState,
    type ExploreOrderOffer,
    type ExploreRow,
    type OfferFilter,
  } from "$lib/services/sales-explore";
  import type {
    CellRendererParams,
    ColumnFilterModel,
    GpGridProps,
    GridCore,
  } from "@gp-grid/vue";
  import { mode } from "mode-watcher";
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";

  let {
    endpoint,
    search,
    brandNames,
    offers,
    columnState,
    initialFilter,
    onOpenOrder,
    onOfferMenu,
    onRowsMenu,
    onState,
  }: {
    /** Route base, e.g. "/sales/explore". */
    endpoint: string;
    /** URL query string (with "?") carrying the date window + brands. */
    search: string;
    brandNames: Record<string, string>;
    /** Offers Assistant filter; a change refreshes the grid. */
    offers: OfferFilter | null;
    /** Column filters restored from the URL, applied before the first fetch. */
    initialFilter: ExploreFilter;
    /** Saved column layout from user.meta; null = defaults. */
    columnState: ExploreColumnState | null;
    onOpenOrder: (pk: string) => void;
    /** Click or right-click on an offer in the Offers column (viewport coords). */
    onOfferMenu: (offer: ExploreOrderOffer, x: number, y: number) => void;
    /**
     * Right-click on a body cell: how many rows are selected (cell range,
     * else the active cell) and the pks of those already loaded. Above
     * EXPLORE_PAGE_MAX_ROWS (e.g. Ctrl+A) pks is left empty.
     */
    onRowsMenu: (pks: string[], selected: number, x: number, y: number) => void;
    onState: (state: ExploreGridState) => void;
  } = $props();

  function openRowsMenu(event: MouseEvent) {
    const core = getCore?.();
    // Body cells only; the keyboard Menu key / Shift+F10 also lands here.
    if (!core || (event.target as Element).closest('[role="columnheader"]')) {
      return;
    }
    const range = core.selection.getSelectionRange();
    const active = core.selection.getActiveCell();
    const [from, to] = range
      ? [
          Math.min(range.startRow, range.endRow),
          Math.max(range.startRow, range.endRow),
        ]
      : active
        ? [active.row, active.row]
        : [0, -1];
    if (to < from) return;
    event.preventDefault();
    const selected = to - from + 1;
    const pks: string[] = [];
    if (selected <= EXPLORE_PAGE_MAX_ROWS) {
      for (let row = from; row <= to; row++) {
        const pk = (core.rows.getData(row) as ExploreRow | undefined)?.pk;
        if (pk) pks.push(pk);
      }
    }
    // A keyboard-opened menu has no pointer position: anchor at the grid.
    const box = container.getBoundingClientRect();
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    onRowsMenu(
      pks,
      selected,
      fromKeyboard ? box.left + 16 : event.clientX,
      fromKeyboard ? box.top + 48 : event.clientY,
    );
  }

  let container: HTMLDivElement;
  // Vue-reactive props object of the mounted <GpGrid>; set once mounted.
  let gridProps: GpGridProps<ExploreRow> | undefined;
  let makeSource:
    | ((
        search: string,
        offers: OfferFilter | null,
      ) => GpGridProps<ExploreRow>["dataSource"])
    | undefined;
  let lastFilter: unknown = {};
  let readLayout:
    | (() =>
        | {
            columnId: string;
            width?: number;
            order: number;
            pinned: "start" | "end" | null;
            hidden: boolean;
          }[]
        | null)
    | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let getCore: (() => GridCore | undefined) | undefined;
  let disposed = false;

  // shortcut: gp-grid has no initial-filter option and setFilter() is a silent
  // no-op while a load runs, so re-apply what did not stick every 50 ms (10 s
  // max). Replace with a grid API if gp-grid ever offers one.
  async function applyFilters(changes: [string, ColumnFilterModel | null][]) {
    for (let attempt = 0; attempt < 200 && !disposed; attempt++) {
      const core = getCore?.();
      if (core) {
        const applied = core.sortFilter.getFilterModel();
        const pending = changes.filter(
          ([colId, model]) => colId in applied !== (model !== null),
        );
        if (pending.length === 0) return;
        for (const [colId, model] of pending) {
          await core.sortFilter.setFilter(colId, model);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Removes one column filter (the grid re-queries). */
  export function clearFilter(colId: string) {
    return applyFilters([[colId, null]]);
  }

  /** Removes every column filter. */
  export function clearAllFilters() {
    const applied = getCore?.()?.sortFilter.getFilterModel() ?? {};
    return applyFilters(Object.keys(applied).map((colId) => [colId, null]));
  }

  // Persist the layout after the user stops moving / resizing / pinning.
  function saveLayoutSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const state = readLayout?.();
      if (!state) return;
      const columns = state.map((column) => ({
        columnId: column.columnId,
        width: column.width ?? null,
        order: column.order,
        pinned: column.pinned,
        hidden: column.hidden,
      }));
      // A preference, not data: a failed save is not worth interrupting for.
      void fetch(`${endpoint}/preferences`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns }),
      }).catch(() => {});
    }, 500);
  }

  const euro = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
  });

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${endpoint}/${path}${search}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  onMount(() => {
    let unmount: (() => void) | undefined;

    (async () => {
      // Vue + gp-grid stay out of SSR and out of every other route's bundle.
      const [vue, gp, { createSetFilter }] = await Promise.all([
        import("vue"),
        import("@gp-grid/vue"),
        import("./explore-set-filter"),
      ]);
      if (disposed) return;

      const SetFilter = createSetFilter(
        (colId, text) =>
          post("values", {
            colId,
            search: text,
            filter: lastFilter,
            offers,
          }),
        (colId, value) =>
          colId === "brand" ? (brandNames[value] ?? value) : value,
      );

      // pk -> offers; undefined = not loaded yet. Cells re-render on change.
      const offerNames = vue.reactive(new Map<string, ExploreOrderOffer[]>());
      const loadOffers = async (query: string, pks: string[]) => {
        const missing = pks.filter((pk) => !offerNames.has(pk));
        if (missing.length === 0) return;
        try {
          const response = await fetch(`${endpoint}/offers${query}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pks: missing }),
          });
          if (!response.ok) throw new Error(String(response.status));
          const byPk = (await response.json()) as Record<
            string,
            ExploreOrderOffer[]
          >;
          for (const pk of missing) offerNames.set(pk, byPk[pk] ?? []);
        } catch {
          // Not worth a toast: the column just shows "—" for this page.
          for (const pk of missing) offerNames.set(pk, []);
        }
      };
      const OfferCell = vue.defineComponent({
        props: { pk: { type: String, default: "" } },
        setup(props) {
          return () => {
            const offers = props.pk ? offerNames.get(props.pk) : undefined;
            if (offers === undefined) {
              return vue.h("span", { class: "text-muted-foreground" }, "…");
            }
            if (offers.length === 0) {
              return vue.h("span", { class: "text-muted-foreground" }, "—");
            }
            // Click or right-click an offer to open the "filter by" menu.
            const open = (offer: ExploreOrderOffer) => (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              onOfferMenu(offer, event.clientX, event.clientY);
            };
            return vue.h(
              "span",
              {
                class: "flex min-w-0 items-center gap-1 overflow-hidden",
                title: offers.map((offer) => offer.name).join(", "),
              },
              offers.map((offer) =>
                vue.h(
                  "button",
                  {
                    key: offer.item,
                    type: "button",
                    class:
                      "hover:bg-accent truncate rounded px-1 text-left underline-offset-4 hover:underline",
                    "aria-haspopup": "menu",
                    onClick: open(offer),
                    onContextmenu: open(offer),
                  },
                  offer.name,
                ),
              ),
            );
          };
        },
      });

      makeSource = (query, offerFilter) =>
        gp.createServerDataSource<ExploreRow>(
          async (request) => {
            const sort = request.sort ?? [];
            const filter = serializeGridFilter(request.filter);
            lastFilter = filter;
            try {
              const response = await fetch(`${endpoint}/rows${query}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  range: request.range,
                  sort,
                  filter,
                  offers: offerFilter,
                }),
              });
              if (!response.ok) {
                const detail = await response.text().catch(() => "");
                throw new Error(
                  `HTTP ${response.status} ${detail.slice(0, 200)}`,
                );
              }
              const data = (await response.json()) as {
                rows: ExploreRow[];
                totalRows: number;
              };
              onState({
                sort,
                filter,
                offers: offerFilter,
                totalRows: data.totalRows,
              });
              void loadOffers(
                query,
                data.rows.map((row) => row.pk),
              );
              return data;
            } catch (cause) {
              // Keep the cause: a 401, 400, 500 and an aborted fetch all land here.
              console.error("explore rows failed", cause);
              toast.error("Could not load orders. Try again.", {
                description: cause instanceof Error ? cause.message : undefined,
              });
              return { rows: [], totalRows: 0 };
            }
          },
          { loadMode: "paginated" },
        );

      gridProps = vue.reactive<GpGridProps<ExploreRow>>({
        columns: EXPLORE_COLUMNS.flatMap((column) => [
          {
            field: column.id,
            colId: column.id,
            headerName: column.label,
            width: column.width,
            cellDataType: column.kind === "date" ? "dateString" : column.kind,
            sortable: true,
            filterable: true,
            ...(column.kind === "text"
              ? {
                  filterRenderer: {
                    content: SetFilter,
                    clear: "default" as const,
                  },
                }
              : {}),
            ...(column.id === "brand"
              ? {
                  valueFormatter: (value) =>
                    brandNames[String(value)] ?? String(value),
                }
              : {}),
            ...(column.id === "net" || column.id === "discount"
              ? { valueFormatter: (value) => euro.format(Number(value)) }
              : {}),
            ...(column.id === "order_no"
              ? {
                  pinned: "start" as const,
                  cellRenderer: (params: CellRendererParams) =>
                    vue.h(
                      "button",
                      {
                        type: "button",
                        class:
                          "text-primary font-medium underline-offset-4 hover:underline",
                        onClick: () => {
                          const pk = (params.rowData as ExploreRow | undefined)
                            ?.pk;
                          if (pk) onOpenOrder(pk);
                        },
                      },
                      String(params.value ?? ""),
                    ),
                }
              : {}),
          },
          // Async column right after the order no.: filled per loaded page.
          ...(column.id === "order_no"
            ? [
                {
                  field: "pk",
                  colId: "offers",
                  headerName: "Offers",
                  width: 240,
                  cellDataType: "text" as const,
                  sortable: false,
                  filterable: false,
                  cellRenderer: (params: CellRendererParams) =>
                    vue.h(OfferCell, {
                      pk: (params.rowData as ExploreRow | undefined)?.pk ?? "",
                    }),
                },
              ]
            : []),
        ]),
        // No dataSource yet: it is set after the URL filters are restored.
        rowHeight: 34,
        sortingEnabled: true,
        darkMode: mode.current === "dark",
        rowLoading: { mode: "paginated", cache: { pageSize: 200 } },
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
      readLayout = () => getCore?.()?.columns.getState() ?? null;

      const app = vue.createApp({
        render: () =>
          vue.h(gp.GpGrid, { ...(gridProps as object), ref: gridRef } as never),
      });
      app.mount(container);
      unmount = () => app.unmount();

      // Restore the URL filters before the first fetch (no data source yet).
      await applyFilters(
        Object.entries(initialFilter).map(
          ([colId, model]) =>
            [
              colId,
              {
                ...model,
                // The URL holds arrays; the grid's set filter expects Sets.
                groups: model!.groups.map((group) => ({
                  ...group,
                  conditions: group.conditions.map((condition) =>
                    condition.type === "text" && condition.selectedValues
                      ? {
                          ...condition,
                          selectedValues: new Set(condition.selectedValues),
                        }
                      : condition,
                  ),
                })),
              } as ColumnFilterModel,
            ] as [string, ColumnFilterModel],
        ),
      );
      if (disposed) return;
      gridProps.dataSource = makeSource(search, offers);
    })();

    return () => {
      disposed = true;
      clearTimeout(saveTimer);
      unmount?.();
    };
  });

  // New date window, brands or offer filter: swap the source (gp-grid keeps
  // sort + column filters and re-queries from the top).
  $effect(() => {
    const query = search;
    // Full copy (every field, e.g. combo); also subscribes the effect to them.
    const offerFilter: OfferFilter | null = $state.snapshot(offers);
    untrack(() => {
      if (gridProps && makeSource) {
        gridProps.dataSource = makeSource(query, offerFilter);
      }
    });
  });

  $effect(() => {
    const dark = mode.current === "dark";
    untrack(() => {
      if (gridProps) gridProps.darkMode = dark;
    });
  });
</script>

<div
  bind:this={container}
  class="h-[70vh] min-h-96 w-full"
  role="presentation"
  oncontextmenu={openRowsMenu}
></div>
