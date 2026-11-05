<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatEur, type ComboDetail } from "$lib/services/recipes";

  /** Components of one combo; each code links to its recipe page. */
  let {
    brandAlias,
    components,
  }: { brandAlias: string; components: ComboDetail["components"] } = $props();

  const recipeHref = (itemCode: string) =>
    `/admin/recipes/${encodeURIComponent(brandAlias)}/${encodeURIComponent(itemCode)}`;
</script>

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.Head>Item code</Table.Head>
      <Table.Head>Component</Table.Head>
      <Table.Head class="text-right">Per combo</Table.Head>
      <Table.Head class="text-right">Sold with combo</Table.Head>
      <Table.Head
        class="text-right"
        title="Paid extras or a split of the combo price"
      >
        Net on these lines
      </Table.Head>
      <Table.Head class="text-right">Recipe cost</Table.Head>
      <Table.Head class="text-right">Cost per combo</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each components as component (component.item_code)}
      <Table.Row>
        <Table.Cell class="font-mono text-xs">
          <a class="hover:underline" href={recipeHref(component.item_code)}>
            {component.item_code}
          </a>
        </Table.Cell>
        <Table.Cell>
          <a class="hover:underline" href={recipeHref(component.item_code)}>
            {component.name}
          </a>
        </Table.Cell>
        <Table.Cell class="text-right tabular-nums">
          {component.perCombo.toFixed(2)}
        </Table.Cell>
        <Table.Cell class="text-right tabular-nums">
          {component.qty.toLocaleString("en-IE")}
        </Table.Cell>
        <Table.Cell class="text-right tabular-nums">
          {component.net ? formatEur(component.net, 2) : ""}
        </Table.Cell>
        <Table.Cell class="text-right tabular-nums">
          {#if component.unitCost !== null}
            {formatEur(component.unitCost)}
          {:else}
            <Badge variant="destructive">
              {component.hasRecipe ? "incomplete" : "no recipe"}
            </Badge>
          {/if}
        </Table.Cell>
        <Table.Cell class="text-right tabular-nums">
          {component.lineCost === null ? "" : formatEur(component.lineCost)}
        </Table.Cell>
      </Table.Row>
    {:else}
      <Table.Row>
        <Table.Cell colspan={7} class="text-muted-foreground py-8 text-center">
          No components in this period.
        </Table.Cell>
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
