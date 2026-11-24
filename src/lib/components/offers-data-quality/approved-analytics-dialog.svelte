<script lang="ts">
  import { BarChart } from "layerchart";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import {
    FC_OVER_TARGET_HIGH_POINTS,
    FC_OVER_TARGET_WARN_POINTS,
    PRICE_MISMATCH_TOLERANCE,
    type ApprovedOffersAnalytics,
    type OfferSalesCheckRow,
    type ApprovedOffersMixRow,
  } from "$lib/services/offers-data-quality";

  let {
    open = $bindable(false),
    analytics,
  }: {
    open?: boolean;
    analytics: Promise<
      ApprovedOffersAnalytics & { salesCheck: OfferSalesCheckRow[] }
    >;
  } = $props();

  const euro = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  const chartConfig = {
    approved: { label: "Approved", color: reasonColor(0) },
  } satisfies Chart.ChartConfig;

  const fixed = (value: number | null, suffix = "") =>
    value === null ? "—" : `${value.toFixed(1)}${suffix}`;
  const share = (part: number, total: number) =>
    total === 0 ? "—" : `${Math.round((part / total) * 100)}%`;
  const duration = (hours: number | null) =>
    hours === null
      ? "—"
      : hours < 48
        ? `${hours.toFixed(1)} h`
        : `${(hours / 24).toFixed(1)} d`;
</script>

{#snippet tile(label: string, value: string, hint: string)}
  <div class="rounded-xl border p-4">
    <p class="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
    <p class="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    <p class="text-muted-foreground mt-1 text-xs">{hint}</p>
  </div>
{/snippet}

{#snippet mixTable(title: string, rows: ApprovedOffersMixRow[])}
  <section class="space-y-2">
    <h3 class="text-sm font-medium">{title}</h3>
    <div class="overflow-x-auto rounded-xl border">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{title}</Table.Head>
            <Table.Head class="text-right">Approved</Table.Head>
            <Table.Head class="text-right">Avg discount</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each rows as row (row.label)}
            <Table.Row>
              <Table.Cell>{row.label}</Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {row.approved}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {fixed(row.avgDiscountPct, "%")}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>Approved offers analytics</Dialog.Title>
      <Dialog.Description>
        Every approved submission matching the page filters. Discount is how far
        the selling price is below the ideal price. FC % is recomputed from FC €
        and the selling price, not read from the stored value.
      </Dialog.Description>
    </Dialog.Header>

    {#await analytics}
      <div class="space-y-3" aria-busy="true">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-64 w-full" />
      </div>
    {:then summary}
      {#if summary.total === 0}
        <p class="text-muted-foreground py-10 text-center text-sm">
          No approved offers match these filters.
        </p>
      {:else}
        <div class="space-y-8">
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {@render tile(
              "Approved",
              String(summary.total),
              "Submissions, not unique offers",
            )}
            {@render tile(
              "Median time to approve",
              duration(summary.medianHoursToApprove),
              "From submission to approval",
            )}
            {@render tile(
              "Self-approved",
              share(summary.selfApproved, summary.total),
              `${summary.selfApproved} approved by their own submitter`,
            )}
            {@render tile(
              "With data problems",
              share(summary.problems.any, summary.total),
              `${summary.problems.any} rows, listed below`,
            )}
          </div>

          <section class="space-y-2">
            <h3 class="text-sm font-medium">Pricing by brand</h3>
            <p class="text-muted-foreground text-xs">
              Points over target compare the offer's FC % with the brand target,
              on rows that have FC €, a target and a selling price
              ("checkable"). Any offer sold below ideal is over target, so read
              how far.
            </p>
            <div class="overflow-x-auto rounded-xl border">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Brand</Table.Head>
                    <Table.Head class="text-right">Approved</Table.Head>
                    <Table.Head class="text-right">Avg discount</Table.Head>
                    <Table.Head class="text-right">Checkable</Table.Head>
                    <Table.Head class="text-right">
                      Avg points over target
                    </Table.Head>
                    <Table.Head class="text-right">
                      Over {FC_OVER_TARGET_WARN_POINTS} pts
                    </Table.Head>
                    <Table.Head class="text-right">
                      Over {FC_OVER_TARGET_HIGH_POINTS} pts
                    </Table.Head>
                    <Table.Head class="text-right">Above ideal</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each summary.brands as brand (brand.label)}
                    <Table.Row>
                      <Table.Cell class="font-medium">{brand.label}</Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {brand.approved}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {fixed(brand.avgDiscountPct, "%")}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {brand.checkable}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {fixed(brand.avgPointsOverTarget)}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {brand.overWarn}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {brand.overHigh}
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">
                        {brand.aboveIdeal}
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          </section>

          {#if summary.salesCheck.length > 0}
            <section class="space-y-2">
              <h3 class="text-sm font-medium">Sales check</h3>
              <p class="text-muted-foreground text-xs">
                Approved prices against lifetime POS sales, as of last night.
                Real FC % is units sold × the approved FC € ÷ POS net sales, so
                older sales are costed at today's cost. Offers charged more than
                {PRICE_MISMATCH_TOLERANCE * 100}% away from the approved price
                are counted as a price mismatch and left out of the FC figures.
              </p>
              <div class="overflow-x-auto rounded-xl border">
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>Brand</Table.Head>
                      <Table.Head class="text-right">With sales</Table.Head>
                      <Table.Head class="text-right">Price mismatch</Table.Head>
                      <Table.Head class="text-right">Checked</Table.Head>
                      <Table.Head class="text-right">Net sales</Table.Head>
                      <Table.Head class="text-right">Real FC %</Table.Head>
                      <Table.Head class="text-right">Target</Table.Head>
                      <Table.Head class="text-right"
                        >FC € above target</Table.Head
                      >
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {#each summary.salesCheck as row (row.label)}
                      <Table.Row>
                        <Table.Cell class="font-medium">{row.label}</Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.sold}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.priceMismatch}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.checked}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.checked ? euro.format(row.net) : "—"}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {fixed(row.realFcPct, "%")}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {fixed(row.targetPct, "%")}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.checked ? euro.format(row.eurAboveTarget) : "—"}
                        </Table.Cell>
                      </Table.Row>
                    {/each}
                  </Table.Body>
                </Table.Root>
              </div>
            </section>
          {/if}

          <div class="grid gap-6 lg:grid-cols-2">
            {@render mixTable("Category", summary.categories)}
            {@render mixTable("Channel", summary.channels)}
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <section class="space-y-2">
              <h3 class="text-sm font-medium">Approvals per month</h3>
              <div class="rounded-xl border p-4">
                <Chart.Container config={chartConfig} class="h-56 w-full">
                  <BarChart
                    data={summary.months}
                    x="month"
                    series={[
                      {
                        key: "approved",
                        label: "Approved",
                        color: "var(--color-approved)",
                      },
                    ]}
                  >
                    {#snippet tooltip()}
                      <Chart.Tooltip indicator="dot" />
                    {/snippet}
                  </BarChart>
                </Chart.Container>
              </div>
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-medium">Approvers</h3>
              <div class="overflow-x-auto rounded-xl border">
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>Approved by</Table.Head>
                      <Table.Head class="text-right">Approved</Table.Head>
                      <Table.Head class="text-right">Own submissions</Table.Head
                      >
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {#each summary.approvers as row (row.approver)}
                      <Table.Row>
                        <Table.Cell>{row.approver}</Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.approved}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {row.selfApproved}
                        </Table.Cell>
                      </Table.Row>
                    {/each}
                  </Table.Body>
                </Table.Root>
              </div>
            </section>
          </div>

          <section class="space-y-2">
            <h3 class="text-sm font-medium">Data problems</h3>
            <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {#each [["No FC €", summary.problems.noFcEur, "FC % was typed by hand and cannot be checked"], ["Selling price 0", summary.problems.zeroSellingPrice, "Left out of the discount averages"], ["FC % mismatch", summary.problems.fcPercMismatch, "Stored FC % differs from the recomputed one"], ["Unknown channel", summary.problems.unknownChannel, "Channel is not in the channel list"]] as const as [label, count, hint] (label)}
                <div class="rounded-xl border p-4">
                  <dt class="text-muted-foreground text-xs">{label}</dt>
                  <dd class="text-xl font-semibold tabular-nums">{count}</dd>
                  <dd class="text-muted-foreground mt-1 text-xs">{hint}</dd>
                </div>
              {/each}
            </dl>
          </section>
        </div>
      {/if}
    {:catch}
      <p class="text-destructive py-10 text-center text-sm" role="alert">
        The analytics could not be loaded. Reload the page to try again.
      </p>
    {/await}
  </Dialog.Content>
</Dialog.Root>
