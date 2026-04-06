<script lang="ts">
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatBrandLabel, type BrandOption } from "$lib/services/brands";
  import type {
    AdminDimOfferRow,
    AdminDimOffersSortBy,
    AdminDimOffersSortDir,
  } from "$lib/services/admin-dim-offers";

  type Props = {
    rows: AdminDimOfferRow[];
    brands: BrandOption[];
    sortBy: AdminDimOffersSortBy;
    sortDir: AdminDimOffersSortDir;
    getsorthref: (
      column: AdminDimOffersSortBy,
      nextDirection: AdminDimOffersSortDir,
    ) => string;
  };

  let { rows, brands, sortBy, sortDir, getsorthref }: Props = $props();

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

  const brandsByAlias = $derived(
    new Map(brands.map((brand) => [brand.alias.trim().toLowerCase(), brand])),
  );

  function formatMoney(value: number | null) {
    return value === null ? "-" : moneyFormatter.format(value);
  }

  function formatPercent(value: number | null) {
    return value === null ? "-" : `${percentFormatter.format(value * 100)}%`;
  }

  function getBrandLabel(alias: string | null) {
    if (!alias) {
      return "Unknown";
    }

    const brand = brandsByAlias.get(alias.trim().toLowerCase());

    return brand ? formatBrandLabel(brand) : alias.toUpperCase();
  }

  function getBrandTone(alias: string | null): "outline" | "secondary" {
    return alias ? "outline" : "secondary";
  }

  function getNextSortDirection(column: AdminDimOffersSortBy) {
    return sortBy === column && sortDir === "asc" ? "desc" : "asc";
  }

  function isActiveSort(column: AdminDimOffersSortBy) {
    return sortBy === column;
  }

  function getAuditHref(itemCode: string) {
    return `/admin/dim-offers/${encodeURIComponent(itemCode)}`;
  }

  function formatAuditActor(row: AdminDimOfferRow) {
    return (
      row.last_changed_by_name ??
      row.last_changed_by_email ??
      row.last_changed_by
    );
  }

  function getRowKey(row: AdminDimOfferRow, index: number) {
    return `${row.item_code}:${index}`;
  }

  const sortableColumns: Array<{
    label: string;
    column: AdminDimOffersSortBy;
    className: string;
  }> = [
    { label: "Item code", column: "item_code", className: "min-w-32" },
    { label: "Description", column: "product_desc", className: "min-w-64" },
    { label: "Brand", column: "brand_alias", className: "min-w-32" },
    { label: "Channel", column: "channel", className: "min-w-36" },
    { label: "Category", column: "category", className: "min-w-36" },
    {
      label: "Subcategory",
      column: "subcategory",
      className: "min-w-40",
    },
    { label: "Ideal", column: "ideal_price", className: "min-w-28 text-right" },
    {
      label: "Selling",
      column: "selling_price",
      className: "min-w-28 text-right",
    },
    { label: "FC %", column: "fc_perc", className: "min-w-24 text-right" },
    {
      label: "Marketing",
      column: "mktg_spend",
      className: "min-w-32 text-right",
    },
    {
      label: "Discount",
      column: "discount_amount",
      className: "min-w-32 text-right",
    },
    {
      label: "Last change",
      column: "item_code",
      className: "min-w-56",
    },
  ];
</script>

<div class="overflow-x-auto">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        {#each sortableColumns as sortableColumn (sortableColumn.label)}
          <Table.Head class={sortableColumn.className}>
            <a
              href={getsorthref(
                sortableColumn.column,
                getNextSortDirection(sortableColumn.column),
              )}
              class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <span>{sortableColumn.label}</span>
              {#if isActiveSort(sortableColumn.column)}
                {#if sortDir === "asc"}
                  <ArrowUpIcon class="size-3.5" />
                {:else}
                  <ArrowDownIcon class="size-3.5" />
                {/if}
              {:else}
                <ArrowUpDownIcon class="size-3.5 opacity-50" />
              {/if}
            </a>
          </Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if rows.length > 0}
        {#each rows as row, index (getRowKey(row, index))}
          <Table.Row class="align-top">
            <Table.Cell>
              <div class="space-y-2">
                <a
                  href={getAuditHref(row.item_code)}
                  class="hover:text-foreground font-mono text-xs font-medium text-blue-700 underline-offset-4 transition-colors hover:underline sm:text-sm"
                >
                  {row.item_code}
                </a>
                <a
                  href={getAuditHref(row.item_code)}
                  class="text-muted-foreground inline-flex text-xs underline-offset-4 hover:underline"
                >
                  View audit history
                </a>
              </div>
            </Table.Cell>
            <Table.Cell>
              <div class="space-y-1">
                <p class="font-medium tracking-[-0.01em]">
                  {row.product_desc ?? "No product description"}
                </p>
              </div>
            </Table.Cell>
            <Table.Cell>
              <Badge variant={getBrandTone(row.brand_alias)}>
                {getBrandLabel(row.brand_alias)}
              </Badge>
            </Table.Cell>
            <Table.Cell>{row.channel ?? "-"}</Table.Cell>
            <Table.Cell>{row.category ?? "-"}</Table.Cell>
            <Table.Cell>{row.subcategory ?? "-"}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatMoney(row.ideal_price)}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatMoney(row.selling_price)}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatPercent(row.fc_perc)}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatMoney(row.mktg_spend)}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {formatMoney(row.discount_amount)}
            </Table.Cell>
            <Table.Cell>
              {#if row.last_changed_at}
                <div class="space-y-1 text-sm">
                  <p class="font-medium tracking-[-0.01em]">
                    {formatAuditActor(row) ?? "Unknown actor"}
                  </p>
                  <p class="text-muted-foreground">
                    {new Date(row.last_changed_at).toLocaleString()}
                  </p>
                </div>
              {:else}
                <span class="text-muted-foreground text-sm">No audit yet</span>
              {/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      {:else}
        <Table.Row>
          <Table.Cell
            colspan={12}
            class="text-muted-foreground py-12 text-center text-sm"
          >
            No `dim_offers` rows match the current filter set.
          </Table.Cell>
        </Table.Row>
      {/if}
    </Table.Body>
  </Table.Root>
</div>
