<script lang="ts">
  import { enhance } from "$app/forms";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { PageData } from "./$types";

  type CompanyRow = PageData["companies"][number];
  let {
    data,
    form,
  }: { data: PageData; form: { error?: string; success?: boolean } | null } =
    $props();
</script>

{#snippet companyFields(company: Partial<CompanyRow>, idPrefix: string)}
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2">
        <Label for={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          value={company.name ?? ""}
          required
        />
      </div>
      <div class="space-y-2">
        <Label for={`${idPrefix}-registrationNumber`}>Registration number</Label
        >
        <Input
          id={`${idPrefix}-registrationNumber`}
          name="registrationNumber"
          value={company.registrationNumber ?? ""}
        />
      </div>
      <div class="space-y-2">
        <Label for={`${idPrefix}-vatNumber`}>VAT number</Label>
        <Input
          id={`${idPrefix}-vatNumber`}
          name="vatNumber"
          value={company.vatNumber ?? ""}
        />
      </div>
      <div class="space-y-2">
        <Label for={`${idPrefix}-sapDatabaseId`}>SAP database id</Label>
        <Input
          id={`${idPrefix}-sapDatabaseId`}
          name="sapDatabaseId"
          value={company.sapDatabaseId ?? ""}
          placeholder="e.g. PHC_EUR"
          aria-describedby={`${idPrefix}-sapDatabaseId-hint`}
        />
        <p
          id={`${idPrefix}-sapDatabaseId-hint`}
          class="text-muted-foreground text-xs"
        >
          Ledger company id. Users see this company's management accounts
          through its brands.
        </p>
      </div>
    </div>
    <Label class="flex items-center gap-2 font-normal">
      <Checkbox name="active" checked={company.active ?? true} />
      Active
    </Label>
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Brands</legend>
      <p class="text-muted-foreground text-sm">
        The brands this company operates.
      </p>
      <div class="grid grid-cols-2 gap-2">
        {#each data.brands as brand (brand.id)}
          <Label class="flex items-center gap-2 font-normal">
            <Checkbox
              name="brandIds"
              value={String(brand.id)}
              checked={company.brands?.some((b) => b.id === brand.id) ?? false}
            />
            {brand.name}
            {#if !brand.active}
              <span class="text-muted-foreground">(inactive)</span>
            {/if}
          </Label>
        {/each}
      </div>
    </fieldset>
  </div>
{/snippet}

<svelte:head>
  <title>Companies | Aggregator Offers Tool</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <header class="flex items-center justify-between gap-4">
    <section class="space-y-2">
      <h1 class="text-3xl font-semibold tracking-tight">Companies</h1>
      <p class="text-muted-foreground text-sm">
        Legal entities and the brands they operate.
      </p>
    </section>
    <Dialog.Root>
      <Dialog.Trigger class={buttonVariants()}>Add company</Dialog.Trigger>
      <Dialog.Content class="max-h-[85vh] overflow-y-auto">
        <Dialog.Header>
          <Dialog.Title>Add company</Dialog.Title>
          <Dialog.Description>
            Create a company and the brands it operates.
          </Dialog.Description>
        </Dialog.Header>
        <form method="POST" action="?/createCompany" use:enhance>
          {@render companyFields({}, "create")}
          <Dialog.Footer class="mt-4">
            <Button type="submit">Create company</Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  </header>

  {#if form?.error}
    <p class="text-destructive text-sm" role="alert">{form.error}</p>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Title>All companies</Card.Title>
      <Card.Description>{data.companies.length} companies</Card.Description>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Name</Table.Head>
            <Table.Head>Registration no.</Table.Head>
            <Table.Head>VAT no.</Table.Head>
            <Table.Head>SAP database id</Table.Head>
            <Table.Head>Brands</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.companies as company (company.id)}
            <Table.Row>
              <Table.Cell class="font-medium">{company.name}</Table.Cell>
              <Table.Cell>{company.registrationNumber || "None"}</Table.Cell>
              <Table.Cell>{company.vatNumber || "None"}</Table.Cell>
              <Table.Cell>{company.sapDatabaseId || "None"}</Table.Cell>
              <Table.Cell>
                <div class="flex flex-wrap items-center gap-1">
                  {#each company.brands as brand (brand.id)}
                    <Badge variant="secondary">{brand.name}</Badge>
                  {:else}
                    None
                  {/each}
                </div>
              </Table.Cell>
              <Table.Cell>{company.active ? "Active" : "Inactive"}</Table.Cell>
              <Table.Cell class="text-right">
                <div class="flex items-center justify-end gap-2">
                  <Dialog.Root>
                    <Dialog.Trigger
                      class={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Edit
                    </Dialog.Trigger>
                    <Dialog.Content class="max-h-[85vh] overflow-y-auto">
                      <Dialog.Header>
                        <Dialog.Title>Edit {company.name}</Dialog.Title>
                        <Dialog.Description>
                          Update company details.
                        </Dialog.Description>
                      </Dialog.Header>
                      <form method="POST" action="?/updateCompany" use:enhance>
                        <input type="hidden" name="id" value={company.id} />
                        {@render companyFields(company, `edit-${company.id}`)}
                        <Dialog.Footer class="mt-4">
                          <Button type="submit">Save changes</Button>
                        </Dialog.Footer>
                      </form>
                    </Dialog.Content>
                  </Dialog.Root>
                  <form
                    method="POST"
                    action="?/deleteCompany"
                    use:enhance={({ cancel }) => {
                      if (!confirm(`Delete ${company.name}?`)) cancel();
                    }}
                  >
                    <input type="hidden" name="id" value={company.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</main>
