<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import MktReportCharts from "$lib/components/aggregator-invoices/mkt-report-charts.svelte";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import MultiSelectFilter from "$lib/components/sales/multi-select-filter.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatInvoiceAmount,
    invoiceAggregatorLabel,
    invoiceAggregators,
    type InvoiceAggregator,
  } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import {
    MKT_REPORT_PATH,
    mktReportSearch,
    type MktReportParams,
    type MktSplit,
    type MktTotals,
  } from "$lib/services/aggregator-invoices/mkt-report";
  import { formatBrandLabel } from "$lib/services/brands";
  import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TableIcon from "@lucide/svelte/icons/table";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let exporting = $state(false);
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const params = $derived(data.params);
  const report = $derived(data.report);
  const total = $derived(report.total);

  const aggregatorOptions = invoiceAggregators.map((value) => ({
    value,
    label: invoiceAggregatorLabel(value),
  }));
  const brandOptions = $derived(
    data.brands.map((brand) => ({
      value: String(brand.id),
      label: formatBrandLabel(brand),
    })),
  );
  const storeOptions = $derived(
    data.stores.map((store) => ({ value: store, label: store })),
  );

  function href(next: Partial<MktReportParams>) {
    const search = mktReportSearch({ ...params, ...next });
    return search ? `${MKT_REPORT_PATH}?${search}` : MKT_REPORT_PATH;
  }

  function navigate(next: Partial<MktReportParams>) {
    goto(href(next), { keepFocus: true, noScroll: true });
  }

  function searchText(key: "invoiceNumber" | "lineDetails", value: string) {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      navigate({ [key]: value.trim() || null });
    }, 400);
  }

  const money = (value: number) => formatInvoiceAmount(value);
  const percent = (value: number | null) =>
    value === null ? "–" : `${value.toFixed(2)}%`;

  async function exportExcel() {
    exporting = true;
    try {
      const response = await fetch(
        `${MKT_REPORT_PATH}/export${page.url.search}`,
      );
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch {
      toast.error("The Excel export could not be generated. Try again.");
    } finally {
      exporting = false;
    }
  }
</script>

{#snippet amountCells(totals: MktTotals, withDelivery = false)}
  <Table.Cell class="text-right tabular-nums">{money(totals.net)}</Table.Cell>
  <Table.Cell class="text-right tabular-nums">{money(totals.vat)}</Table.Cell>
  <Table.Cell class="text-right font-medium tabular-nums">
    {money(totals.gross)}
  </Table.Cell>
  {#if withDelivery}
    <Table.Cell class="text-muted-foreground text-right tabular-nums">
      {money(totals.deliveryGross)}
    </Table.Cell>
  {/if}
{/snippet}

{#snippet splitCells(split: MktSplit)}
  {@render amountCells(split.wolt)}
  {@render amountCells(split.bolt, true)}
  {@render amountCells(split.total)}
  <Table.Cell class="text-right tabular-nums">{split.total.invoices}</Table.Cell
  >
  <Table.Cell class="text-right tabular-nums">
    {money(split.total.salesGross)}
  </Table.Cell>
  <Table.Cell class="text-right tabular-nums">
    {percent(split.total.pctOfSales)}
  </Table.Cell>
{/snippet}

<svelte:head>
  <title>Marketing Report | Invoices | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <div
    class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
  >
    <a href="/aggregator-offers" class="hover:text-foreground transition-colors"
      >Aggregator Offers</a
    >
    <ChevronRightIcon class="size-3" />
    <a
      href="/aggregator-offers/invoices"
      class="hover:text-foreground transition-colors">Invoices</a
    >
    <ChevronRightIcon class="size-3" />
    <span>Marketing report</span>
  </div>

  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Marketing report
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      Marketing lines from the aggregator invoices (Wolt MKT, Bolt MKT + MKT_DEL
      delivery marketing). All other line types are ignored, except sales (SAL)
      on the same invoices, used for the % of sales.
    </p>
  </section>

  <div class="flex flex-wrap items-end gap-3">
    <MultiSelectFilter
      label="Aggregator"
      noun="aggregators"
      options={aggregatorOptions}
      selected={params.aggregators}
      onApply={(values) =>
        navigate({ aggregators: values as InvoiceAggregator[], stores: [] })}
    />
    <MultiSelectFilter
      label="Brand"
      noun="brands"
      options={brandOptions}
      selected={params.brands.map(String)}
      onApply={(values) => navigate({ brands: values.map(Number), stores: [] })}
    />
    <MultiSelectFilter
      label="Store"
      noun="stores"
      options={storeOptions}
      selected={params.stores}
      onApply={(stores) => navigate({ stores })}
    />

    <div class="space-y-2">
      <label class="text-sm font-medium" for="invoiceNumber">Invoice #</label>
      <Input
        id="invoiceNumber"
        class="w-40"
        value={params.invoiceNumber ?? ""}
        placeholder="Invoice number"
        oninput={(event) =>
          searchText("invoiceNumber", event.currentTarget.value)}
      />
    </div>

    <div class="space-y-2">
      <label class="text-sm font-medium" for="lineDetails">Line details</label>
      <div class="relative">
        <SearchIcon
          class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id="lineDetails"
          class="w-56 pl-9"
          value={params.lineDetails ?? ""}
          placeholder="e.g. Display Banner"
          oninput={(event) =>
            searchText("lineDetails", event.currentTarget.value)}
        />
      </div>
    </div>

    <div class="space-y-2">
      <span class="text-sm font-medium">Document date</span>
      <DateRangeFilter
        from={params.from}
        to={params.to}
        onApply={(range) =>
          navigate({ from: range.from ?? null, to: range.to ?? null })}
      />
    </div>

    <Button
      variant="outline"
      disabled={exporting || report.byStore.length === 0}
      onclick={exportExcel}
    >
      {#if exporting}
        <LoaderCircleIcon class="size-4 animate-spin" />
      {:else}
        <DownloadIcon class="size-4" />
      {/if}
      Export to Excel
    </Button>
  </div>

  <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
    {#each [{ label: "Marketing gross", value: money(total.total.gross) }, { label: "Marketing net", value: money(total.total.net) }, { label: "VAT", value: money(total.total.vat) }, { label: "Bolt delivery marketing", value: money(total.bolt.deliveryGross) }, { label: "Invoices", value: String(total.total.invoices) }, { label: "% of sales", value: percent(total.total.pctOfSales) }] as kpi (kpi.label)}
      <Card.Root class="gap-1 py-4">
        <Card.Header class="px-4">
          <Card.Description>{kpi.label}</Card.Description>
          <Card.Title class="text-xl tabular-nums">{kpi.value}</Card.Title>
        </Card.Header>
      </Card.Root>
    {/each}
  </div>

  <Card.Root>
    <Card.Header class="flex flex-row items-start justify-between gap-4">
      <div class="space-y-1">
        <Card.Title>Marketing totals</Card.Title>
        <Card.Description>
          Amounts from the invoice lines; gross includes VAT.
        </Card.Description>
      </div>
      <ButtonGroup.Root>
        <Button
          href={href({ view: "chart" })}
          variant={params.view === "chart" ? "default" : "outline"}
          aria-current={params.view === "chart" ? "page" : undefined}
        >
          <ChartColumnIcon class="size-4" />
          Chart
        </Button>
        <Button
          href={href({ view: "table" })}
          variant={params.view === "table" ? "default" : "outline"}
          aria-current={params.view === "table" ? "page" : undefined}
        >
          <TableIcon class="size-4" />
          Table
        </Button>
      </ButtonGroup.Root>
    </Card.Header>
    <Card.Content>
      {#if report.byStore.length === 0}
        <p class="text-muted-foreground py-6 text-sm">
          No marketing lines match the current filters.
        </p>
      {:else if params.view === "chart"}
        <MktReportCharts {report} />
      {:else}
        <Table.Root class="text-xs">
          <Table.Header>
            <Table.Row>
              <Table.Head rowspan={2}>Store</Table.Head>
              <Table.Head colspan={3} class="text-center">Wolt</Table.Head>
              <Table.Head colspan={4} class="text-center">Bolt</Table.Head>
              <Table.Head colspan={3} class="text-center">Total</Table.Head>
              <Table.Head rowspan={2} class="text-right">Invoices</Table.Head>
              <Table.Head rowspan={2} class="text-right">Sales</Table.Head>
              <Table.Head rowspan={2} class="text-right">% sales</Table.Head>
            </Table.Row>
            <Table.Row>
              {#each ["Net", "VAT", "Gross", "Net", "VAT", "Gross", "of which MKT_DEL", "Net", "VAT", "Gross"] as head, index (index)}
                <Table.Head class="text-right">{head}</Table.Head>
              {/each}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each report.byStore as row (row.store)}
              <Table.Row>
                <Table.Cell class="max-w-56 truncate" title={row.store}>
                  {row.store}
                </Table.Cell>
                {@render splitCells(row)}
              </Table.Row>
            {/each}
          </Table.Body>
          <Table.Footer>
            <Table.Row class="font-semibold">
              <Table.Cell>Total</Table.Cell>
              {@render splitCells(total)}
            </Table.Row>
          </Table.Footer>
        </Table.Root>
      {/if}
    </Card.Content>
  </Card.Root>
</main>
