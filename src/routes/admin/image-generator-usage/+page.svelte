<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import UsageByModelChart from "$lib/components/image-generator/usage-by-model-chart.svelte";
  import UsageOverTimeChart from "$lib/components/image-generator/usage-over-time-chart.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import DateRangeFilter from "./date-range-filter.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const summary = $derived(data.overview.summary);
  const providers = $derived(data.overview.providers);
  const models = $derived(data.overview.models);
  const topUsers = $derived(data.overview.topUsers);
  const failures = $derived(data.failures);
  const range = $derived(data.range);
  const canViewUserGenerations = $derived(data.canViewUserGenerations);

  // Failure rows the admin has expanded to inspect the stored provider
  // request/response payloads.
  let expandedFailureIds = $state<Set<string>>(new Set());

  function toggleFailure(id: string) {
    const next = new Set(expandedFailureIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedFailureIds = next;
  }

  function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2) ?? "null";
  }

  const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  function formatTimestamp(iso: string): string {
    return dateTimeFormatter.format(new Date(iso));
  }

  // Append the active range to a chart endpoint so the async charts match the
  // SSR figures on the page.
  function withRange(basePath: string): string {
    const params = new URLSearchParams();
    if (range.from) {
      params.set("from", range.from);
    }
    if (range.to) {
      params.set("to", range.to);
    }
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  const usageEndpoint = $derived(withRange("/api/admin/image-generator/usage"));
  const modelEndpoint = $derived(
    withRange("/api/admin/image-generator/usage-by-model"),
  );

  function applyRange(next: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (next.from) {
      params.set("from", next.from);
    }
    if (next.to) {
      params.set("to", next.to);
    }
    const query = params.toString();
    goto(`${page.url.pathname}${query ? `?${query}` : ""}`, {
      noScroll: true,
      keepFocus: true,
    });
  }

  const numberFormatter = new Intl.NumberFormat();

  function formatNumber(value: number): string {
    return numberFormatter.format(value);
  }

  const successRate = $derived(
    summary.totalImages > 0
      ? Math.round((summary.completed / summary.totalImages) * 100)
      : 0,
  );

  const stats = $derived([
    { label: "Total images", value: formatNumber(summary.totalImages) },
    { label: "Active users", value: formatNumber(summary.totalUsers) },
    { label: "Completed", value: formatNumber(summary.completed) },
    { label: "Failed", value: formatNumber(summary.failed) },
  ]);

  const maxProviderCount = $derived(
    providers.reduce((max, provider) => Math.max(max, provider.count), 0),
  );

  const maxModelCount = $derived(
    models.reduce((max, model) => Math.max(max, model.count), 0),
  );
</script>

<svelte:head>
  <title>Image generator usage | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Admin dashboard showing image-generation usage across all users over time."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <p
          class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
        >
          Admin workspace
        </p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Image generator usage
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Generation activity across every user, including totals, success rate,
          and the most active accounts.
        </p>
      </div>

      <Button href="/admin" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to admin
      </Button>
    </section>

    <section
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-muted-foreground text-sm">
        Filter every figure on this page by a preset or a custom date range.
      </p>
      <DateRangeFilter from={range.from} to={range.to} onApply={applyRange} />
    </section>

    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {#each stats as stat (stat.label)}
        <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
          <Card.Header class="pb-2">
            <Card.Description>{stat.label}</Card.Description>
            <Card.Title class="text-3xl tracking-[-0.03em]">
              {stat.value}
            </Card.Title>
          </Card.Header>
        </Card.Root>
      {/each}
    </section>

    <UsageOverTimeChart
      endpoint={usageEndpoint}
      title="Usage over time"
      description="Images generated across all users, by day."
    />

    <UsageByModelChart
      endpoint={modelEndpoint}
      title="Generations per model over time"
      description="Images generated per model, by day."
    />

    <section class="grid gap-4 lg:grid-cols-2">
      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header>
          <Card.Title class="text-xl tracking-[-0.02em]">
            Provider breakdown
          </Card.Title>
          <Card.Description>
            Images generated per provider · {successRate}% completed overall.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#if providers.length === 0}
            <p class="text-muted-foreground text-sm">No generations yet.</p>
          {:else}
            {#each providers as provider (provider.label)}
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium">{provider.label}</span>
                  <span class="text-muted-foreground">
                    {formatNumber(provider.count)}
                  </span>
                </div>
                <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    class="bg-primary h-full rounded-full"
                    style:width={`${maxProviderCount > 0 ? (provider.count / maxProviderCount) * 100 : 0}%`}
                  ></div>
                </div>
              </div>
            {/each}
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header>
          <Card.Title class="text-xl tracking-[-0.02em]">
            Model breakdown
          </Card.Title>
          <Card.Description>Images generated per model.</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#if models.length === 0}
            <p class="text-muted-foreground text-sm">No generations yet.</p>
          {:else}
            {#each models as model (model.label)}
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium">{model.label}</span>
                  <span class="text-muted-foreground">
                    {formatNumber(model.count)}
                  </span>
                </div>
                <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    class="bg-primary h-full rounded-full"
                    style:width={`${maxModelCount > 0 ? (model.count / maxModelCount) * 100 : 0}%`}
                  ></div>
                </div>
              </div>
            {/each}
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <section>
      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header>
          <Card.Title class="text-xl tracking-[-0.02em]">
            Most active users
          </Card.Title>
          <Card.Description>
            Top accounts by number of images generated.
            {#if canViewUserGenerations}
              Click a user to view all of their generations.
            {/if}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if topUsers.length === 0}
            <p class="text-muted-foreground text-sm">No generations yet.</p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head class="w-10">#</Table.Head>
                  <Table.Head>User</Table.Head>
                  <Table.Head class="text-right">Images</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each topUsers as user, index (user.userId)}
                  <Table.Row>
                    <Table.Cell class="text-muted-foreground">
                      {index + 1}
                    </Table.Cell>
                    <Table.Cell>
                      {#if canViewUserGenerations}
                        <!-- Only super users may open a user's full generation history. -->
                        <a
                          href={`/image-generator/${user.userId}`}
                          class="group flex flex-col"
                        >
                          <span
                            class="font-medium underline-offset-4 group-hover:underline"
                          >
                            {user.name}
                          </span>
                          <span class="text-muted-foreground text-xs">
                            {user.email}
                          </span>
                        </a>
                      {:else}
                        <div class="flex flex-col">
                          <span class="font-medium">{user.name}</span>
                          <span class="text-muted-foreground text-xs">
                            {user.email}
                          </span>
                        </div>
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="text-right">
                      <Badge variant="secondary">
                        {formatNumber(user.count)}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <section>
      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header>
          <Card.Title class="text-xl tracking-[-0.02em]">
            Failed provider requests
          </Card.Title>
          <Card.Description>
            Every failed provider attempt in the selected range — including
            attempts that later succeeded on retry. Expand a row to inspect the
            exact request and the provider's raw response.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if failures.length === 0}
            <p class="text-muted-foreground text-sm">
              No failed requests in this range.
            </p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>When</Table.Head>
                  <Table.Head>User</Table.Head>
                  <Table.Head>Provider / model</Table.Head>
                  <Table.Head>Error</Table.Head>
                  <Table.Head class="text-right">Outcome</Table.Head>
                  <Table.Head class="w-10" />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each failures as failure (failure.id)}
                  <Table.Row>
                    <Table.Cell class="text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(failure.createdAt)}
                    </Table.Cell>
                    <Table.Cell>
                      <div class="flex flex-col">
                        <span class="font-medium">{failure.user.name}</span>
                        <span class="text-muted-foreground text-xs">
                          {failure.user.email}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div class="flex flex-col">
                        <span class="font-medium">{failure.provider}</span>
                        <span class="text-muted-foreground text-xs">
                          {failure.model ?? "Default model"}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell class="max-w-80">
                      <span
                        class="line-clamp-2 text-sm"
                        title={failure.errorMessage}
                      >
                        {failure.errorMessage}
                      </span>
                      <span class="text-muted-foreground text-xs">
                        {failure.errorName}
                        {#if failure.responseStatus !== null && failure.responseStatus > 0}
                          · HTTP {failure.responseStatus}
                        {/if}
                        · attempt {failure.attempt}
                      </span>
                    </Table.Cell>
                    <Table.Cell class="text-right">
                      <!-- "completed" here means a retry eventually succeeded. -->
                      <Badge
                        variant={failure.generationStatus === "failed"
                          ? "destructive"
                          : "secondary"}
                      >
                        {failure.generationStatus === "failed"
                          ? "Failed"
                          : "Recovered"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Toggle failure details"
                        aria-expanded={expandedFailureIds.has(failure.id)}
                        onclick={() => toggleFailure(failure.id)}
                      >
                        <ChevronDownIcon
                          class={`size-4 transition-transform ${
                            expandedFailureIds.has(failure.id)
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                  {#if expandedFailureIds.has(failure.id)}
                    <Table.Row class="hover:bg-transparent">
                      <Table.Cell colspan={6}>
                        <div class="grid gap-4 py-2 lg:grid-cols-2">
                          <div class="space-y-1.5">
                            <p class="text-sm font-medium">Prompt</p>
                            <p class="text-muted-foreground text-sm">
                              {failure.prompt}
                            </p>
                            <p class="text-sm font-medium">Request sent</p>
                            <pre
                              class="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">{formatJson(
                                failure.requestSnapshot,
                              )}</pre>
                          </div>
                          <div class="space-y-1.5">
                            <p class="text-sm font-medium">Provider response</p>
                            <pre
                              class="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">{formatJson(
                                failure.responseBody,
                              )}</pre>
                            <p class="text-muted-foreground text-xs">
                              Generation {failure.generatedImageId}
                              {#if failure.durationMs !== null}
                                · attempt took {failure.durationMs} ms
                              {/if}
                            </p>
                          </div>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  {/if}
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>
  </main>
</div>
