<script lang="ts">
  import { flip } from "svelte/animate";
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import { invalidate } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import WidgetFrame from "$lib/components/dashboard/widget-frame.svelte";
  import WidgetSettingsDialog from "$lib/components/dashboard/widget-settings-dialog.svelte";
  import GapsList from "$lib/components/dashboard/widgets/gaps-list.svelte";
  import SalesSummary from "$lib/components/dashboard/widgets/sales-summary.svelte";
  import DeliverySummary from "$lib/components/dashboard/widgets/delivery-summary.svelte";
  import OffersSummary from "$lib/components/dashboard/widgets/offers-summary.svelte";
  import LatestRelease from "$lib/components/dashboard/widgets/latest-release.svelte";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import {
    newWidgetId,
    SALES_PERIOD_LABELS,
    widgetDefinitions,
    type DashboardWidget,
    type SalesWidgetSettings,
    type WidgetDataMap,
    type WidgetResult,
    type WidgetType,
  } from "$lib/dashboard/widgets";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const FLIP_MS = 200;

  // Local copy the drag zone can reorder; reset whenever the server layout reloads.
  let widgets = $derived(data.layout);
  let editing = $state(false);
  /** Widget being configured; `after` set = a duplicate that is inserted only on save. */
  let settingsFor = $state<{ widget: DashboardWidget; after?: string } | null>(
    null,
  );
  let settingsOpen = $state(false);

  async function save(next: DashboardWidget[], reload: boolean) {
    const response = await fetch("/api/dashboard/layout", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      // Strip svelte-dnd-action's shadow-item marker.
      body: JSON.stringify({
        widgets: next.map(({ id, type, settings }) => ({ id, type, settings })),
      }),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Could not save your dashboard.");
      return;
    }
    // shortcut: reloads every widget, not just the changed one; add a per-widget endpoint if the dashboard gets slow.
    if (reload) await invalidate("app:dashboard");
  }

  function consider(event: CustomEvent<DndEvent<DashboardWidget>>) {
    widgets = event.detail.items;
  }

  function finalize(event: CustomEvent<DndEvent<DashboardWidget>>) {
    widgets = event.detail.items;
    void save(widgets, false);
  }

  function add(type: WidgetType) {
    void save(
      [...widgets, { id: newWidgetId(type), type, settings: {} }],
      true,
    );
  }

  function remove(id: string) {
    widgets = widgets.filter((widget) => widget.id !== id);
    void save(widgets, true);
  }

  async function reset() {
    await fetch("/api/dashboard/layout", { method: "DELETE" }).catch(
      () => null,
    );
    await invalidate("app:dashboard");
  }

  function openSettings(widget: DashboardWidget) {
    settingsFor = { widget };
    settingsOpen = true;
  }

  /** Opens the copy's settings first, so it is saved already pointing at another brand. */
  function duplicate(widget: DashboardWidget) {
    settingsFor = {
      widget: { ...widget, id: newWidgetId(widget.type) },
      after: widget.id,
    };
    settingsOpen = true;
  }

  function saveSettings(settings: SalesWidgetSettings) {
    if (!settingsFor) return;
    const { widget, after } = settingsFor;
    const updated = { ...widget, settings };
    void save(
      after
        ? widgets.flatMap((w) => (w.id === after ? [w, updated] : [w]))
        : widgets.map((w) => (w.id === widget.id ? updated : w)),
      true,
    );
  }

  /** The widget's streamed data, typed for its widget type. */
  function streamOf<K extends WidgetType>(widget: DashboardWidget, type: K) {
    return widget.type === type
      ? (data.streamed[widget.id] as Promise<WidgetResult<WidgetDataMap[K]>>)
      : undefined;
  }

  /** "Offers performance · Akashi": unset brand = the first brand in scope. */
  function salesTitle(widget: DashboardWidget) {
    const alias = (widget.settings as SalesWidgetSettings).brand;
    const brand =
      data.salesBrands.find((option) => option.alias === alias) ??
      data.salesBrands[0];
    const title = widgetDefinitions[widget.type].title;
    return brand ? `${title} · ${brand.name}` : title;
  }

  /** "Week to date" etc., shown in sales widget descriptions. */
  const periodLabel = (widget: DashboardWidget) =>
    SALES_PERIOD_LABELS[(widget.settings as SalesWidgetSettings).period];
</script>

<svelte:head>
  <title>Dashboard — Marketing Tools</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p class="text-muted-foreground text-sm">
        {editing
          ? "Drag widgets to reorder them (or focus one and use Space + arrow keys)."
          : "Your widgets. Customize to reorder, add or remove them."}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if editing}
        {#if data.available.length > 0}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class={buttonVariants({ variant: "outline" })}
            >
              <PlusIcon class="size-4" />
              Add widget
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {#each data.available as type (type)}
                <DropdownMenu.Item onSelect={() => add(type)}>
                  {widgetDefinitions[type].title}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
        <Button variant="outline" onclick={reset}>Reset to default</Button>
      {/if}
      <Button
        variant={editing ? "default" : "outline"}
        onclick={() => (editing = !editing)}
      >
        {editing ? "Done" : "Customize"}
      </Button>
    </div>
  </div>

  {#if widgets.length === 0}
    <p
      class="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm"
    >
      {data.available.length > 0
        ? "No widgets yet. Use Customize → Add widget."
        : "There are no widgets for your roles yet."}
    </p>
  {/if}

  <div
    class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
    use:dndzone={{
      items: widgets,
      flipDurationMs: FLIP_MS,
      dragDisabled: !editing,
      dropTargetStyle: {},
    }}
    onconsider={consider}
    onfinalize={finalize}
  >
    {#each widgets as widget (widget.id)}
      {@const def = widgetDefinitions[widget.type]}
      <div animate:flip={{ duration: FLIP_MS }} class="h-full">
        {#if widget.type === "open-gaps" || widget.type === "awaiting-approval"}
          {@const empty =
            widget.type === "open-gaps"
              ? "No open gaps for your brands."
              : "Nothing waiting for approval."}
          <WidgetFrame
            title={def.title}
            description={def.description}
            result={streamOf(widget, widget.type)}
            {editing}
            onremove={() => remove(widget.id)}
          >
            {#snippet children(gaps)}
              <GapsList data={gaps} {empty} />
            {/snippet}
          </WidgetFrame>
        {:else if widget.type === "sales-summary"}
          <WidgetFrame
            title={salesTitle(widget)}
            description={`${periodLabel(widget)} vs last year (same dates).`}
            result={streamOf(widget, widget.type)}
            {editing}
            onsettings={() => openSettings(widget)}
            onduplicate={() => duplicate(widget)}
            onremove={() => remove(widget.id)}
          >
            {#snippet children(sales)}
              <SalesSummary data={sales} />
            {/snippet}
          </WidgetFrame>
        {:else if widget.type === "delivery-summary"}
          <WidgetFrame
            title={salesTitle(widget)}
            description={`${periodLabel(widget)} on aggregator channels.`}
            result={streamOf(widget, widget.type)}
            {editing}
            onsettings={() => openSettings(widget)}
            onduplicate={() => duplicate(widget)}
            onremove={() => remove(widget.id)}
          >
            {#snippet children(delivery)}
              <DeliverySummary data={delivery} />
            {/snippet}
          </WidgetFrame>
        {:else if widget.type === "latest-release"}
          <WidgetFrame
            title={def.title}
            description={def.description}
            result={streamOf(widget, widget.type)}
            {editing}
            emptyMessage="No release notes yet."
            onremove={() => remove(widget.id)}
          >
            {#snippet children(release)}
              <LatestRelease {release} />
            {/snippet}
          </WidgetFrame>
        {:else if widget.type === "offers-summary"}
          <WidgetFrame
            title={salesTitle(widget)}
            description={`${periodLabel(widget)} offer value and verdicts.`}
            result={streamOf(widget, widget.type)}
            {editing}
            onsettings={() => openSettings(widget)}
            onduplicate={() => duplicate(widget)}
            onremove={() => remove(widget.id)}
          >
            {#snippet children(offers)}
              <OffersSummary data={offers} />
            {/snippet}
          </WidgetFrame>
        {/if}
      </div>
    {/each}
  </div>
</div>

{#if settingsFor}
  <WidgetSettingsDialog
    bind:open={settingsOpen}
    title={settingsFor.after
      ? `Duplicate ${widgetDefinitions[settingsFor.widget.type].title}`
      : salesTitle(settingsFor.widget)}
    settings={settingsFor.widget.settings as SalesWidgetSettings}
    brands={data.salesBrands}
    onsave={saveSettings}
  />
{/if}
