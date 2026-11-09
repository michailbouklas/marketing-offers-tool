<script lang="ts">
  import { BarChart } from "layerchart";
  import { SvelteMap } from "svelte/reactivity";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import {
    formatAccounting,
    summariseBreakdown,
    type BreakdownKey,
    type MarketingAccountDetail,
    type MarketingCostLine,
  } from "$lib/services/management-accounts";

  let {
    open = $bindable(false),
    account,
    years,
    company,
    month,
    basePath,
  }: {
    open?: boolean;
    /** The clicked table row; `values` align with `years`. */
    account: MarketingCostLine | null;
    years: number[];
    company: string | null;
    month: number | null;
    /** Page path the `/account/[code]` endpoint hangs off. */
    basePath: string;
  } = $props();

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat("en-GB", { month: "short" }).format(
      new Date(2000, index, 1),
    ),
  );
  const monthLabel = $derived(
    month
      ? new Intl.DateTimeFormat("en-GB", { month: "long" }).format(
          new Date(2000, month - 1, 1),
        )
      : null,
  );

  let year = $state("");
  let detail = $state<MarketingAccountDetail | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let requestSequence = 0;
  const cache = new SvelteMap<string, MarketingAccountDetail>();

  // On open: start at the latest year the account has a value in.
  $effect.pre(() => {
    if (!open || !account) return;
    const latest = years.findLastIndex((_, index) => account.values[index]);
    year = String(years[latest >= 0 ? latest : years.length - 1]);
  });

  async function load(key: string, url: string) {
    const requestId = ++requestSequence;
    loadError = null;
    const cached = cache.get(key);
    if (cached) {
      detail = cached;
      loading = false;
      return;
    }
    detail = null;
    loading = true;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as MarketingAccountDetail;
      cache.set(key, result);
      if (requestId === requestSequence) detail = result;
    } catch {
      if (requestId === requestSequence) {
        loadError = "The account details could not be loaded. Try again.";
      }
    } finally {
      if (requestId === requestSequence) loading = false;
    }
  }

  $effect(() => {
    if (!open || !account || !year) return;
    const params = new URLSearchParams({ year });
    if (company) params.set("company", company);
    if (month) params.set("month", String(month));
    void load(
      `${account.code}?${params}`,
      `${basePath}/account/${encodeURIComponent(account.code)}?${params}`,
    );
  });

  const yearIndex = $derived(detail ? detail.years.indexOf(detail.year) : -1);
  /** Selected-year total: equals the table cell (it honours the month filter). */
  const total = $derived(
    detail?.breakdown.reduce((sum, row) => sum + row.value, 0) ?? 0,
  );
  const lineCount = $derived(
    detail?.breakdown.reduce((sum, row) => sum + row.lines, 0) ?? 0,
  );

  // Chart plots spend (positive) per month, one bar per year.
  const chartConfig = $derived(
    Object.fromEntries(
      years.map((y, index) => [
        `y${y}`,
        {
          label: String(y),
          // The theme's chart palette is monochrome: the selected year stands out in primary.
          color:
            String(y) === year ? "var(--primary)" : `var(--chart-${index + 2})`,
        },
      ]),
    ) satisfies Chart.ChartConfig,
  );
  const chartData = $derived(
    monthNames.map((name, monthIndex) => ({
      month: name,
      ...Object.fromEntries(
        (detail?.years ?? []).map((y, index) => [
          `y${y}`,
          -(detail?.monthly[index][monthIndex] ?? 0),
        ]),
      ),
    })),
  );
  const compactEuro = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
  });

  const breakdownTabs: { key: BreakdownKey; label: string }[] = [
    { key: "company", label: "Company" },
    { key: "brand", label: "Brand" },
    { key: "store", label: "Store" },
    { key: "supplier", label: "Supplier" },
    { key: "type", label: "Type" },
  ];
  let breakdownKey = $state<BreakdownKey>("company");
  const breakdownItems = $derived(
    detail ? summariseBreakdown(detail.breakdown, breakdownKey) : [],
  );
  const percent = new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: 1,
  });

  let postingSort = $state<"value" | "date">("value");
  const postings = $derived(
    postingSort === "value"
      ? (detail?.postings ?? [])
      : [...(detail?.postings ?? [])].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
  );

  const hasBudget = $derived((detail?.budgetCompanies.length ?? 0) > 0);
  const budgetTotal = $derived(
    detail?.budget.reduce((sum, value) => sum + value, 0) ?? 0,
  );
  const budgetActualTotal = $derived(
    detail?.budgetActual.reduce((sum, value) => sum + value, 0) ?? 0,
  );
</script>

{#snippet stat(label: string, value: string)}
  <div class="bg-muted/30 rounded-xl border p-4">
    <p class="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
    <p class="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
  </div>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
    {#if account}
      <Dialog.Header>
        <Dialog.Title class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-sm">{account.code}</span>
          {account.name}
        </Dialog.Title>
        <Dialog.Description class="flex flex-wrap items-center gap-2">
          {#if detail}{detail.group}{/if}
          <Badge variant="outline">{company ?? "All companies"}</Badge>
          {#if monthLabel}<Badge variant="outline">{monthLabel} only</Badge
            >{/if}
        </Dialog.Description>
      </Dialog.Header>

      <Tabs.Root bind:value={year}>
        <Tabs.List>
          {#each years as y (y)}
            <Tabs.Trigger value={String(y)}>{y}</Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>

      {#if loadError}
        <p class="text-destructive py-8 text-center text-sm" role="alert">
          {loadError}
        </p>
      {:else if loading || !detail}
        <div class="grid gap-3 sm:grid-cols-3">
          {#each [0, 1, 2] as index (index)}
            <Skeleton class="h-24 w-full rounded-xl" />
          {/each}
        </div>
        <Skeleton class="h-56 w-full rounded-xl" />
        <Skeleton class="h-40 w-full rounded-xl" />
      {:else}
        <div class="grid gap-3 sm:grid-cols-3">
          {@render stat(
            `${detail.year}${monthLabel ? ` · ${monthLabel}` : ""} total`,
            formatAccounting(total),
          )}
          {@render stat("GL lines", lineCount.toLocaleString("en-GB"))}
          {@render stat(
            `Budget ${detail.year}${monthLabel ? ` · ${monthLabel}` : ""}`,
            hasBudget
              ? formatAccounting(month ? detail.budget[month - 1] : budgetTotal)
              : "No budget",
          )}
        </div>

        <section class="space-y-2">
          <h3 class="font-medium">Monthly trend</h3>
          <p class="text-muted-foreground text-sm">
            Spend per month for every year (all months, whatever the page's
            month filter).
          </p>
          <div class="rounded-xl border p-4">
            <Chart.Container config={chartConfig} class="h-56 w-full">
              <BarChart
                data={chartData}
                x="month"
                seriesLayout="group"
                legend
                series={detail.years.map((y) => ({
                  key: `y${y}`,
                  label: String(y),
                  color: `var(--color-y${y})`,
                }))}
                props={{
                  yAxis: { format: (v: number) => compactEuro.format(v) },
                }}
              >
                {#snippet tooltip()}
                  <Chart.Tooltip indicator="dot" />
                {/snippet}
              </BarChart>
            </Chart.Container>
          </div>
          <div class="overflow-x-auto rounded-xl border">
            <Table.Root class="text-xs">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Year</Table.Head>
                  {#each monthNames as name (name)}
                    <Table.Head class="text-right">{name}</Table.Head>
                  {/each}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each detail.years as y, index (y)}
                  <Table.Row
                    class={index === yearIndex ? "bg-muted/50 font-medium" : ""}
                  >
                    <Table.Cell>{y}</Table.Cell>
                    {#each detail.monthly[index] as value, m (m)}
                      <Table.Cell
                        class={[
                          "text-right tabular-nums",
                          month && m !== month - 1 && "text-muted-foreground",
                        ]}
                      >
                        {formatAccounting(value)}
                      </Table.Cell>
                    {/each}
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="font-medium">Where it went in {detail.year}</h3>
          <p class="text-muted-foreground text-sm">
            Supplier is the business partner on the same document. Most journal
            entries (accruals, recharges) have none, and are listed as “(none)”:
            read their remarks under Postings.
          </p>
          <Tabs.Root bind:value={breakdownKey}>
            <Tabs.List>
              {#each breakdownTabs as tab (tab.key)}
                <Tabs.Trigger value={tab.key}>{tab.label}</Tabs.Trigger>
              {/each}
            </Tabs.List>
          </Tabs.Root>
          <div class="overflow-x-auto rounded-xl border">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head
                    >{breakdownTabs.find((tab) => tab.key === breakdownKey)
                      ?.label}</Table.Head
                  >
                  <Table.Head class="text-right">Lines</Table.Head>
                  <Table.Head class="text-right">Amount</Table.Head>
                  <Table.Head class="w-40 text-right">Share</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each breakdownItems as item (item.label)}
                  <Table.Row>
                    <Table.Cell>{item.label}</Table.Cell>
                    <Table.Cell class="text-right tabular-nums"
                      >{item.lines.toLocaleString("en-GB")}</Table.Cell
                    >
                    <Table.Cell class="text-right font-medium tabular-nums"
                      >{formatAccounting(item.value)}</Table.Cell
                    >
                    <Table.Cell class="text-right tabular-nums">
                      <div class="flex items-center justify-end gap-2">
                        <div
                          class="bg-muted h-1.5 w-16 overflow-hidden rounded-full"
                          aria-hidden="true"
                        >
                          <div
                            class="bg-primary h-full"
                            style="width: {Math.max(
                              0,
                              Math.min(1, item.share),
                            ) * 100}%"
                          ></div>
                        </div>
                        {percent.format(item.share)}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                {:else}
                  <Table.Row>
                    <Table.Cell
                      colspan={4}
                      class="text-muted-foreground py-6 text-center"
                    >
                      No postings in {detail.year}.
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </section>

        <section class="space-y-2">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 class="font-medium">Postings</h3>
              <p class="text-muted-foreground text-sm">
                {#if detail.postingCount > detail.postings.length}
                  The {detail.postings.length.toLocaleString("en-GB")} largest of
                  {detail.postingCount.toLocaleString("en-GB")} lines.
                {:else}
                  All {detail.postingCount.toLocaleString("en-GB")} lines.
                {/if}
              </p>
            </div>
            <div class="flex gap-1" role="group" aria-label="Sort postings">
              <Button
                size="sm"
                variant={postingSort === "value" ? "secondary" : "ghost"}
                aria-pressed={postingSort === "value"}
                onclick={() => (postingSort = "value")}>Largest first</Button
              >
              <Button
                size="sm"
                variant={postingSort === "date" ? "secondary" : "ghost"}
                aria-pressed={postingSort === "date"}
                onclick={() => (postingSort = "date")}>Newest first</Button
              >
            </div>
          </div>
          <div class="max-h-96 overflow-auto rounded-xl border">
            <Table.Root class="text-xs">
              <Table.Header>
                <Table.Row>
                  <Table.Head>Date</Table.Head>
                  <Table.Head>Type</Table.Head>
                  <Table.Head>Doc</Table.Head>
                  <Table.Head>Brand</Table.Head>
                  <Table.Head>Store</Table.Head>
                  <Table.Head>Supplier</Table.Head>
                  <Table.Head>Remarks</Table.Head>
                  <Table.Head class="text-right">Amount</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each postings as posting, index (index)}
                  <Table.Row>
                    <Table.Cell class="whitespace-nowrap tabular-nums"
                      >{posting.date}</Table.Cell
                    >
                    <Table.Cell>{posting.type}</Table.Cell>
                    <Table.Cell
                      class="font-mono"
                      title="TransId {posting.transId}"
                      >{posting.docNo}</Table.Cell
                    >
                    <Table.Cell title={posting.company}
                      >{posting.brand}</Table.Cell
                    >
                    <Table.Cell>{posting.store}</Table.Cell>
                    <Table.Cell>{posting.supplier}</Table.Cell>
                    <Table.Cell
                      class="max-w-72 truncate"
                      title={posting.remarks}>{posting.remarks}</Table.Cell
                    >
                    <Table.Cell class="text-right font-medium tabular-nums"
                      >{formatAccounting(posting.value)}</Table.Cell
                    >
                  </Table.Row>
                {:else}
                  <Table.Row>
                    <Table.Cell
                      colspan={8}
                      class="text-muted-foreground py-6 text-center"
                    >
                      No postings in {detail.year}.
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="font-medium">Budget vs actual {detail.year}</h3>
          {#if hasBudget}
            <p class="text-muted-foreground text-sm">
              Only companies with a budget for this account are compared:
              {detail.budgetCompanies.join(", ")}. Variance = actual − budget;
              negative means overspent. Budgets are not validated against Power
              BI.
            </p>
            <div class="overflow-x-auto rounded-xl border">
              <Table.Root class="text-xs">
                <Table.Header>
                  <Table.Row>
                    <Table.Head></Table.Head>
                    {#each monthNames as name (name)}
                      <Table.Head class="text-right">{name}</Table.Head>
                    {/each}
                    <Table.Head class="text-right">Year</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each [{ label: "Budget", values: detail.budget, sum: budgetTotal }, { label: "Actual", values: detail.budgetActual, sum: budgetActualTotal }, { label: "Variance", values: detail.budgetActual.map((value, m) => value - (detail?.budget[m] ?? 0)), sum: budgetActualTotal - budgetTotal }] as row (row.label)}
                    <Table.Row
                      class={row.label === "Variance" ? "font-medium" : ""}
                    >
                      <Table.Cell>{row.label}</Table.Cell>
                      {#each row.values as value, m (m)}
                        <Table.Cell
                          class={[
                            "text-right tabular-nums",
                            row.label === "Variance" &&
                              Math.round(value) < 0 &&
                              "text-destructive",
                          ]}>{formatAccounting(value)}</Table.Cell
                        >
                      {/each}
                      <Table.Cell
                        class={[
                          "text-right font-medium tabular-nums",
                          row.label === "Variance" &&
                            Math.round(row.sum) < 0 &&
                            "text-destructive",
                        ]}>{formatAccounting(row.sum)}</Table.Cell
                      >
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          {:else}
            <p class="text-muted-foreground text-sm">
              No budget for this account in {detail.year} for the selected companies.
            </p>
          {/if}
        </section>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
