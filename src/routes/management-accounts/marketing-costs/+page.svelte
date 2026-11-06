<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import Grid3x3Icon from "@lucide/svelte/icons/grid-3x3";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
  import Minimize2Icon from "@lucide/svelte/icons/minimize-2";
  import ChatWidget from "$lib/components/ai-chat/chat-widget.svelte";
  import MarketingCostsGrid from "$lib/components/management-accounts/marketing-costs-grid.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatAccounting } from "$lib/services/management-accounts";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const table = $derived(data.table);
  const expanded = new SvelteSet<string>();
  let exploring = $state(false);
  let immersive = $state(false);
  let exporting = $state(false);
  let grid = $state<ReturnType<typeof MarketingCostsGrid>>();

  /** Excel of the grid's filtered + sorted rows; the server re-reads the numbers. */
  async function exportExcel() {
    const codes = grid?.visibleCodes() ?? [];
    if (codes.length === 0) {
      toast.error("No rows match the current filters.");
      return;
    }
    exporting = true;
    const toastId = toast.loading("Preparing the Excel export…");
    try {
      const response = await fetch(`${page.url.pathname}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: data.company,
          month: data.month,
          codes,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Export failed (${response.status})`);
      }
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
      toast.success("Excel export ready, downloading.", { id: toastId });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "The Excel export could not be generated.",
        { id: toastId },
      );
    } finally {
      exporting = false;
    }
  }

  function toggle(code: string) {
    if (expanded.has(code)) expanded.delete(code);
    else expanded.add(code);
  }

  const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long" });
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    name: monthFormat.format(new Date(2000, index, 1)),
  }));

  /** Company/month selects live in the URL so the load re-runs with them. */
  function setParam(name: string, event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const url = new URL(page.url);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    goto(url, { keepFocus: true, noScroll: true });
  }
</script>

<svelte:head>
  <title>Marketing Costs | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section class="space-y-2">
    <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
      Marketing costs
    </h1>
    <p class="text-muted-foreground max-w-3xl text-base leading-7">
      The Marketing Cost block of the Management Accounts dashboard, per
      calendar year, built from the SAP general ledger. Costs are shown in
      brackets. The current year includes everything posted so far. Pick a month
      to compare just that month across the years.
    </p>
  </section>

  {#if data.companies.length === 0}
    <p class="text-muted-foreground text-sm" role="status">
      None of your assigned brands belongs to a company with ledger data, so
      there is nothing to show. Ask an admin to assign your brands.
    </p>
  {/if}

  <!-- Immersive: fixed overlay above sidebar (z-10) and top nav (z-40), below portalled popovers/dialogs (z-50). -->
  <div
    class={immersive
      ? "bg-background fixed inset-0 z-45 flex flex-col gap-3 p-4"
      : "contents"}
  >
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-full max-w-sm space-y-2">
          <label class="text-sm font-medium" for="company">Company</label>
          <NativeSelect.Root
            id="company"
            value={data.company ?? ""}
            onchange={(event) => setParam("company", event)}
          >
            <NativeSelect.Option value="">All companies</NativeSelect.Option>
            {#each data.companies as company (company)}
              <NativeSelect.Option value={company}
                >{company}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
        </div>
        <div class="w-44 space-y-2">
          <label class="text-sm font-medium" for="month">Month</label>
          <NativeSelect.Root
            id="month"
            value={data.month ? String(data.month) : ""}
            onchange={(event) => setParam("month", event)}
          >
            <NativeSelect.Option value="">All months</NativeSelect.Option>
            {#each months as month (month.value)}
              <NativeSelect.Option value={String(month.value)}
                >{month.name}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        {#if exploring}
          <Button
            variant="outline"
            aria-pressed={immersive}
            onclick={() => (immersive = !immersive)}
          >
            {#if immersive}
              <Minimize2Icon class="size-4" />
              Exit immersive mode
            {:else}
              <Maximize2Icon class="size-4" />
              Immersive mode
            {/if}
          </Button>
          <Button variant="outline" disabled={exporting} onclick={exportExcel}>
            {#if exporting}
              <LoaderCircleIcon class="size-4 animate-spin" />
              Working…
            {:else}
              <DownloadIcon class="size-4" />
              Export to Excel
            {/if}
          </Button>
        {/if}
        <Button
          variant={exploring ? "secondary" : "outline"}
          aria-pressed={exploring}
          onclick={() => {
            exploring = !exploring;
            immersive = false;
          }}
        >
          <Grid3x3Icon class="size-4" />
          {exploring ? "Exit exploration mode" : "Exploration mode"}
        </Button>
      </div>
    </div>

    {#if exploring}
      <p class="text-muted-foreground text-sm">
        One row per GL account. Filter and sort with the column headers. Costs
        are negative numbers (shown in brackets), so number filters compare
        against negative values.
      </p>
      <div
        class={[
          "overflow-hidden rounded-xl border",
          immersive ? "min-h-0 flex-1" : "h-[70vh] min-h-96",
        ]}
      >
        <MarketingCostsGrid bind:this={grid} {table} />
      </div>
    {/if}
  </div>

  {#if !exploring}
    <Card.Root>
      <Card.Content class="px-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="pl-6">Line</Table.Head>
              {#each table.years as year (year)}
                <Table.Head class="text-right">{year}</Table.Head>
              {/each}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row class="bg-muted/50 font-semibold">
              <Table.Cell class="pl-6">Marketing Cost</Table.Cell>
              {#each table.total as value, index (index)}
                <Table.Cell class="text-right tabular-nums">
                  {formatAccounting(value)}
                </Table.Cell>
              {/each}
            </Table.Row>

            {#each table.groups as group (group.code)}
              {@const open = expanded.has(group.code)}
              <Table.Row>
                <Table.Cell class="pl-4">
                  <button
                    type="button"
                    class="hover:text-foreground flex items-center gap-1 text-left"
                    aria-expanded={open}
                    onclick={() => toggle(group.code)}
                  >
                    <ChevronRightIcon
                      class="size-4 shrink-0 transition-transform {open
                        ? 'rotate-90'
                        : ''}"
                    />
                    {group.name}
                  </button>
                </Table.Cell>
                {#each group.values as value, index (index)}
                  <Table.Cell class="text-right tabular-nums">
                    {formatAccounting(value)}
                  </Table.Cell>
                {/each}
              </Table.Row>

              {#if open}
                {#each group.accounts as account (account.code)}
                  <Table.Row class="text-muted-foreground text-sm">
                    <Table.Cell class="pl-12">
                      <span class="font-mono text-xs">{account.code}</span>
                      {account.name}
                    </Table.Cell>
                    {#each account.values as value, index (index)}
                      <Table.Cell class="text-right tabular-nums">
                        {formatAccounting(value)}
                      </Table.Cell>
                    {/each}
                  </Table.Row>
                {/each}
              {/if}
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={table.years.length + 1}
                  class="text-muted-foreground py-8 text-center"
                >
                  No marketing postings in these years.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
      <Card.Footer class="text-muted-foreground text-xs">
        Source: SAP GL (SAPBW), Credit − Debit in EUR, year-end closing entries
        and ODL One Delivery excluded, as in Power BI. Aggregator marketing
        costs (Foody, Wolt, Bolt) are counted under Internet Advertising
        Expenses.
      </Card.Footer>
    </Card.Root>
  {/if}

  <ChatWidget
    agentId="management-accounts-agent"
    title="Management Accounts Assistant"
    greeting="Hi! Ask me about marketing spend: by year, month, company, brand, account or against budget…"
  />
</main>
