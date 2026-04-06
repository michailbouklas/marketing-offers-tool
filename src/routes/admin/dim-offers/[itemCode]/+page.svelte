<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type {
    AdminDimOfferAuditEntry,
    AdminDimOfferRow,
  } from "$lib/services/admin-dim-offers";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const currentItem = $derived(data.item);
  const audits = $derived(data.audits);

  const moneyFormatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const percentFormatter = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  type AuditField = {
    key: keyof AdminDimOfferRow;
    label: string;
  };

  const auditFields: AuditField[] = [
    { key: "product_desc", label: "Description" },
    { key: "channel", label: "Channel" },
    { key: "category", label: "Category" },
    { key: "subcategory", label: "Subcategory" },
    { key: "ideal_price", label: "Ideal price" },
    { key: "selling_price", label: "Selling price" },
    { key: "fc_perc", label: "FC %" },
    { key: "mktg_spend", label: "Marketing spend" },
    { key: "discount_amount", label: "Discount amount" },
  ];

  function formatCellValue(key: keyof AdminDimOfferRow, value: unknown) {
    if (key === "fc_perc") {
      return typeof value === "number"
        ? `${percentFormatter.format(value * 100)}%`
        : "-";
    }

    if (
      key === "ideal_price" ||
      key === "selling_price" ||
      key === "mktg_spend" ||
      key === "discount_amount"
    ) {
      return typeof value === "number" ? moneyFormatter.format(value) : "-";
    }

    return typeof value === "string" && value.trim().length > 0 ? value : "-";
  }

  function getChangeRows(entry: AdminDimOfferAuditEntry) {
    return auditFields
      .filter((field) => entry.changed_fields.includes(field.key))
      .map((field) => ({
        label: field.label,
        before: formatCellValue(field.key, entry.before_values?.[field.key]),
        after: formatCellValue(field.key, entry.after_values[field.key]),
      }));
  }

  function formatActor(entry: AdminDimOfferAuditEntry) {
    return entry.changed_by_name ?? entry.changed_by_email ?? entry.changed_by;
  }

  function formatCurrentValue(label: string, value: unknown) {
    if (label === "FC %") {
      return typeof value === "number"
        ? `${percentFormatter.format(value * 100)}%`
        : "-";
    }

    if (typeof value === "number") {
      return moneyFormatter.format(value);
    }

    return typeof value === "string" && value.trim().length > 0 ? value : "-";
  }
</script>

<svelte:head>
  <title>Dim Offers Audit | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Inspect the full audit history for a dim_offers item, including actor, timestamps, and field-level changes."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_16%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_16%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <span>Admin</span>
      <ChevronRightIcon class="size-3" />
      <a
        href="/admin/dim-offers"
        class="hover:text-foreground transition-colors">Dim offers</a
      >
      <ChevronRightIcon class="size-3" />
      <span>Audit history</span>
    </div>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div class="space-y-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Audit trail
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            {data.itemCode}
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Review the approval history for this `dim_offers` row, including who
            approved each change and the exact before/after values.
          </p>
        </div>
      </div>

      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Content class="grid gap-4 p-5">
          <div>
            <p class="text-3xl font-semibold tracking-[-0.04em]">
              {audits.length}
            </p>
            <p class="text-muted-foreground mt-1 text-sm">Recorded changes</p>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <HistoryIcon class="text-muted-foreground size-4" />
            <span
              >{currentItem ? "Current row found" : "Audit-only history"}</span
            >
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <div>
      <Button href="/admin/dim-offers" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to dim_offers
      </Button>
    </div>

    {#if currentItem}
      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Header>
          <Card.Title class="text-2xl tracking-[-0.03em]"
            >Current values</Card.Title
          >
          <Card.Description>
            Snapshot of the row currently visible in ClickHouse.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Description
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Description", currentItem.product_desc)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Channel
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Channel", currentItem.channel)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Category
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Category", currentItem.category)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Subcategory
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Subcategory", currentItem.subcategory)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Ideal price
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Ideal price", currentItem.ideal_price)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Selling price
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Selling price", currentItem.selling_price)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                FC %
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("FC %", currentItem.fc_perc)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Marketing spend
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue("Marketing spend", currentItem.mktg_spend)}
              </p>
            </div>
            <div class="rounded-2xl border p-4">
              <p
                class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
              >
                Discount amount
              </p>
              <p class="mt-2 text-sm font-medium">
                {formatCurrentValue(
                  "Discount amount",
                  currentItem.discount_amount,
                )}
              </p>
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <div class="grid gap-4">
      {#each audits as audit (audit.id)}
        <Card.Root
          class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
        >
          <Card.Header>
            <div
              class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={audit.action === "insert"
                      ? "default"
                      : "secondary"}
                  >
                    {audit.action}
                  </Badge>
                  <Badge variant="outline">{audit.source}</Badge>
                  {#if audit.staging_id !== null}
                    <Badge variant="outline">Staging #{audit.staging_id}</Badge>
                  {/if}
                  {#if audit.dq_id !== null}
                    <Badge variant="outline">Gap #{audit.dq_id}</Badge>
                  {/if}
                </div>
                <div>
                  <Card.Title class="text-xl tracking-[-0.03em]">
                    {formatActor(audit)}
                  </Card.Title>
                  <Card.Description>
                    Approved on {new Date(audit.changed_at).toLocaleString()}.
                    {#if audit.changed_by_email}
                      Contact: {audit.changed_by_email}
                    {/if}
                  </Card.Description>
                </div>
              </div>

              <div class="rounded-2xl border px-4 py-3 text-sm">
                <p
                  class="text-muted-foreground text-xs tracking-[0.18em] uppercase"
                >
                  Changed fields
                </p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {#each audit.changed_fields as field (field)}
                    <Badge variant="secondary">{field}</Badge>
                  {/each}
                </div>
              </div>
            </div>
          </Card.Header>

          <Card.Content>
            <div class="overflow-x-auto rounded-2xl border">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Field</Table.Head>
                    <Table.Head>Before</Table.Head>
                    <Table.Head>After</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each getChangeRows(audit) as row (row.label)}
                    <Table.Row>
                      <Table.Cell class="font-medium">{row.label}</Table.Cell>
                      <Table.Cell class="text-muted-foreground"
                        >{row.before}</Table.Cell
                      >
                      <Table.Cell>{row.after}</Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  </main>
</div>
