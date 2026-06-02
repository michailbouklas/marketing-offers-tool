<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { adminUserRole, roleLabels } from "$lib/auth/roles";
  import { formatBrandLabel } from "$lib/services/brands";
  import type { UserRecord } from "$lib/services/users";

  type Props = {
    users: UserRecord[];
    onedituser: (user: UserRecord) => void;
  };

  let { users, onedituser }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  });

  function formatDate(value: Date) {
    return dateFormatter.format(value);
  }
</script>

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.Head class="min-w-48">Name</Table.Head>
      <Table.Head class="min-w-56">Email</Table.Head>
      <Table.Head class="min-w-56">Brands</Table.Head>
      <Table.Head class="min-w-28">Role</Table.Head>
      <Table.Head class="min-w-36">Created At</Table.Head>
      <Table.Head class="min-w-28 text-right">Actions</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#if users.length > 0}
      {#each users as user}
        <Table.Row class="align-top">
          <Table.Cell>
            <div class="space-y-1">
              <p class="font-medium tracking-[-0.01em]">{user.name}</p>
              {#if user.banned}
                <p class="text-destructive text-xs">Banned account</p>
              {/if}
            </div>
          </Table.Cell>
          <Table.Cell class="text-muted-foreground">{user.email}</Table.Cell>
          <Table.Cell>
            {#if user.brands.length > 0}
              <div class="flex flex-wrap gap-1.5">
                {#each user.brands as brand}
                  <Badge variant="secondary">{formatBrandLabel(brand)}</Badge>
                {/each}
              </div>
            {:else}
              <span class="text-muted-foreground text-sm"
                >No brands assigned</span
              >
            {/if}
          </Table.Cell>
          <Table.Cell>
            <div class="flex flex-wrap gap-1.5">
              {#each user.roles as role (role)}
                <Badge
                  variant={role === adminUserRole ? "default" : "secondary"}
                >
                  {roleLabels[role]}
                </Badge>
              {/each}
            </div>
          </Table.Cell>
          <Table.Cell>{formatDate(user.createdAt)}</Table.Cell>
          <Table.Cell class="text-right">
            <Button
              variant="outline"
              size="sm"
              onclick={() => onedituser(user)}
            >
              Edit
            </Button>
          </Table.Cell>
        </Table.Row>
      {/each}
    {:else}
      <Table.Row>
        <Table.Cell
          colspan={6}
          class="text-muted-foreground py-12 text-center text-sm"
        >
          No users found yet. Create the first account from the add user dialog.
        </Table.Cell>
      </Table.Row>
    {/if}
  </Table.Body>
</Table.Root>
