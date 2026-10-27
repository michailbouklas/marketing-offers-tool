<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import BrandAiContextTab from "$lib/components/admin/brand/brand-ai-context-tab.svelte";
  import BrandAssetsCard from "$lib/components/admin/brand/brand-assets-card.svelte";
  import BrandEntitiesCard from "$lib/components/admin/brand/brand-entities-card.svelte";
  import BrandPricingTargetsCard from "$lib/components/admin/brand/brand-pricing-targets-card.svelte";
  import GoogleAnalyticsPropertiesCard from "$lib/components/admin/google-analytics-properties-card.svelte";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const TABS = [
    "general",
    "ai-context",
    "assets",
    "analytics",
    "entities",
  ] as const;
  type TabId = (typeof TABS)[number];
  const DEFAULT_TAB: TabId = "general";

  function isTabId(value: string | null): value is TabId {
    return value !== null && (TABS as readonly string[]).includes(value);
  }

  // The URL is the single source of truth, so reload, back/forward and deep
  // links (e.g. ?tab=entities from Google Reviews) all land on the right tab.
  const tab = $derived<TabId>(
    (() => {
      const raw = page.url.searchParams.get("tab");
      return isTabId(raw) ? raw : DEFAULT_TAB;
    })(),
  );

  function selectTab(value: string) {
    const next = isTabId(value) ? value : DEFAULT_TAB;
    if (next === tab) return;
    const query = next === DEFAULT_TAB ? "" : `?tab=${next}`;
    // The load function never reads the URL, so this does not re-fetch.
    void goto(`${page.url.pathname}${query}`, {
      noScroll: true,
      keepFocus: true,
    });
  }
</script>

<svelte:head>
  <title>{data.brand.name} brand | Admin</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"
>
  <section class="space-y-2">
    <a
      class="text-muted-foreground text-sm hover:underline"
      href="/admin/brands"
    >
      ← All brands
    </a>
    <h1 class="text-3xl font-semibold tracking-tight">{data.brand.name}</h1>
    <p class="text-muted-foreground text-sm">
      Slug:
      {#if data.brand.slug}
        <code class="text-xs">{data.brand.slug}</code>
      {:else}
        <span class="text-destructive">empty — uploads disabled until set</span>
      {/if}
    </p>
  </section>

  <Tabs.Root value={tab} onValueChange={selectTab} class="gap-6">
    <!-- Scrolls the strip on narrow screens. overflow-y is hidden because the
         trigger line boxes overrun the h-8 list by 1px, which would otherwise
         render a vertical scrollbar. -->
    <div class="max-w-full overflow-x-auto overflow-y-hidden">
      <Tabs.List class="w-full">
        <Tabs.Trigger value="general">General</Tabs.Trigger>
        <Tabs.Trigger value="ai-context">AI context</Tabs.Trigger>
        <Tabs.Trigger value="assets">Assets</Tabs.Trigger>
        <Tabs.Trigger value="analytics">Analytics</Tabs.Trigger>
        <Tabs.Trigger value="entities">
          Entities
          <span class="text-muted-foreground">({data.assignments.length})</span>
        </Tabs.Trigger>
      </Tabs.List>
    </div>

    <Tabs.Content value="general">
      <BrandPricingTargetsCard
        brandId={data.brand.id}
        idealFcPercent={data.idealFcPercent}
      />
    </Tabs.Content>

    <Tabs.Content value="ai-context">
      <BrandAiContextTab
        brandId={data.brand.id}
        slug={data.brand.slug}
        guidelines={data.guidelines}
        complianceRules={data.complianceRules}
      />
    </Tabs.Content>

    <Tabs.Content value="assets">
      <BrandAssetsCard brandId={data.brand.id} assets={data.assets} />
    </Tabs.Content>

    <Tabs.Content value="analytics">
      <GoogleAnalyticsPropertiesCard
        brandId={data.brand.id}
        properties={data.googleAnalytics.properties}
        canManage={data.googleAnalytics.canManage}
        configured={data.googleAnalytics.configured}
      />
    </Tabs.Content>

    <Tabs.Content value="entities">
      <BrandEntitiesCard
        brandId={data.brand.id}
        assignments={data.assignments}
      />
    </Tabs.Content>
  </Tabs.Root>
</main>
