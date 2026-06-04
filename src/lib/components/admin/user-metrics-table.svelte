<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { adminUserRole, roleLabels } from "$lib/auth/roles";
  import type { UserLoginMetric } from "$lib/services/user-metrics";

  type Props = {
    metrics: UserLoginMetric[];
  };

  let { metrics }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  });

  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
</script>

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.Head class="min-w-48">Name</Table.Head>
      <Table.Head class="min-w-56">Email</Table.Head>
      <Table.Head class="min-w-28">Roles</Table.Head>
      <Table.Head class="min-w-44">Last login</Table.Head>
      <Table.Head class="min-w-32 text-right">Active sessions</Table.Head>
      <Table.Head class="min-w-36">Created</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#if metrics.length > 0}
      {#each metrics as metric (metric.id)}
        <Table.Row class="align-top">
          <Table.Cell>
            <div class="space-y-1">
              <p class="font-medium tracking-[-0.01em]">{metric.name}</p>
              {#if metric.banned}
                <p class="text-destructive text-xs">Banned account</p>
              {/if}
            </div>
          </Table.Cell>
          <Table.Cell class="text-muted-foreground">{metric.email}</Table.Cell>
          <Table.Cell>
            <div class="flex flex-wrap gap-1.5">
              {#each metric.roles as role (role)}
                <Badge
                  variant={role === adminUserRole ? "default" : "secondary"}
                >
                  {roleLabels[role]}
                </Badge>
              {/each}
            </div>
          </Table.Cell>
          <Table.Cell>
            {#if metric.lastLoginAt}
              {dateTimeFormatter.format(metric.lastLoginAt)}
            {:else}
              <span class="text-muted-foreground text-sm">Never</span>
            {/if}
          </Table.Cell>
          <Table.Cell class="text-right tabular-nums">
            {metric.activeSessionCount}
          </Table.Cell>
          <Table.Cell>{dateFormatter.format(metric.createdAt)}</Table.Cell>
        </Table.Row>
      {/each}
    {:else}
      <Table.Row>
        <Table.Cell
          colspan={6}
          class="text-muted-foreground py-12 text-center text-sm"
        >
          No users found.
        </Table.Cell>
      </Table.Row>
    {/if}
  </Table.Body>
</Table.Root>
