/**
 * gp-grid filter popup (Vue render function) whose options come from the
 * server, not from loaded rows: gp-grid only offers `distinctValues` from
 * data on screen. Applies a text condition carrying `selectedValues`.
 * Loaded lazily with Vue, never during SSR.
 */
import type { ColumnFilterModel, FilterRendererParams } from "@gp-grid/vue";
import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type PropType,
} from "vue";

export type LoadExploreValues = (
  colId: string,
  search: string,
) => Promise<{ values: string[]; truncated: boolean }>;

function selectedFrom(filter: ColumnFilterModel | undefined): Set<string> {
  const condition = filter?.groups[0]?.conditions[0];
  return new Set(
    condition?.type === "text" && condition.selectedValues
      ? [...condition.selectedValues].map(String)
      : [],
  );
}

export function createSetFilter(
  loadValues: LoadExploreValues,
  labelFor: (colId: string, value: string) => string,
) {
  return defineComponent({
    props: {
      columnId: { type: String, required: true },
      currentFilter: Object as PropType<ColumnFilterModel>,
      apply: {
        type: Function as PropType<FilterRendererParams["apply"]>,
        required: true,
      },
      close: Function as PropType<FilterRendererParams["close"]>,
      column: Object,
      distinctValues: Array,
      labels: Object,
    },
    setup(props) {
      const selected = ref(selectedFrom(props.currentFilter));
      const search = ref("");
      const values = ref<string[]>([]);
      const truncated = ref(false);
      const status = ref<"loading" | "ready" | "failed">("loading");
      let timer: ReturnType<typeof setTimeout> | undefined;
      let latest = 0;

      async function load() {
        const id = ++latest;
        status.value = "loading";
        try {
          const result = await loadValues(props.columnId, search.value);
          if (id !== latest) return; // a newer search superseded this one
          values.value = result.values;
          truncated.value = result.truncated;
          status.value = "ready";
        } catch {
          if (id === latest) status.value = "failed";
        }
      }

      onMounted(load);
      onUnmounted(() => clearTimeout(timer));
      watch(search, () => {
        clearTimeout(timer);
        timer = setTimeout(load, 250);
      });

      function toggle(value: string) {
        const next = new Set(selected.value);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        selected.value = next;
      }

      function apply() {
        props.apply(
          selected.value.size
            ? {
                combination: "and",
                groups: [
                  {
                    combination: "and",
                    conditions: [
                      {
                        type: "text",
                        operator: "equals",
                        selectedValues: new Set(selected.value),
                      },
                    ],
                  },
                ],
              }
            : null,
        );
        props.close?.();
      }

      const button =
        "rounded-md px-3 py-1 text-sm font-medium disabled:opacity-50";

      return () =>
        h("div", { class: "flex w-64 flex-col gap-2 p-2 text-sm" }, [
          h("input", {
            class:
              "border-input bg-background h-8 rounded-md border px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            placeholder: "Search…",
            "aria-label": "Search values",
            value: search.value,
            onInput: (event: Event) =>
              (search.value = (event.target as HTMLInputElement).value),
          }),
          h(
            "div",
            { class: "max-h-60 overflow-y-auto", role: "group" },
            status.value === "loading"
              ? h("p", { class: "text-muted-foreground px-2 py-1" }, "Loading…")
              : status.value === "failed"
                ? h(
                    "p",
                    { class: "text-destructive px-2 py-1" },
                    "Could not load values",
                  )
                : values.value.length === 0
                  ? h(
                      "p",
                      { class: "text-muted-foreground px-2 py-1" },
                      "No values",
                    )
                  : values.value.map((value) =>
                      h(
                        "label",
                        {
                          key: value,
                          class:
                            "hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1",
                        },
                        [
                          h("input", {
                            type: "checkbox",
                            checked: selected.value.has(value),
                            onChange: () => toggle(value),
                          }),
                          h(
                            "span",
                            { class: "truncate" },
                            value === ""
                              ? "(blank)"
                              : labelFor(props.columnId, value),
                          ),
                        ],
                      ),
                    ),
          ),
          truncated.value
            ? h(
                "p",
                { class: "text-muted-foreground text-xs" },
                "Showing the first 200 values. Search to narrow.",
              )
            : null,
          h(
            "div",
            { class: "flex items-center justify-between gap-2 border-t pt-2" },
            [
              h(
                "button",
                {
                  type: "button",
                  class: `${button} hover:bg-accent`,
                  disabled: selected.value.size === 0,
                  onClick: () => (selected.value = new Set()),
                },
                `Clear (${selected.value.size})`,
              ),
              h(
                "button",
                {
                  type: "button",
                  class: `${button} bg-primary text-primary-foreground`,
                  onClick: apply,
                },
                "Apply",
              ),
            ],
          ),
        ]);
    },
  });
}
