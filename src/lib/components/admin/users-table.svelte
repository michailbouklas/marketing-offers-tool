<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import UserActiveToggle from "$lib/components/admin/user-active-toggle.svelte";
  import { adminUserRole, roleLabels } from "$lib/auth/roles";
  import { formatBrandLabel } from "$lib/services/brands";
  import type { UserRecord } from "$lib/services/users";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";

  type Props = {
    users: UserRecord[];
    onedituser: (user: UserRecord) => void;
    /** History lives behind `requireSuperUser`; hide the link for others. */
    showHistory?: boolean;
  };

  let { users, onedituser, showHistory = false }: Props = $props();

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  });
  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDate(value: Date) {
    return dateFormatter.format(value);
  }

  type SortField =
    | "name"
    | "email"
    | "brands"
    | "role"
    | "createdAt"
    | "lastActiveAt";

  // Matches the server's default order (newest accounts first).
  let sortField = $state<SortField>("createdAt");
  let sortDirection = $state<"asc" | "desc">("desc");

  /** Sort value per column; null always sorts last (e.g. never active). */
  function sortValue(
    user: UserRecord,
    field: SortField,
  ): string | number | null {
    switch (field) {
      case "name":
        return user.name;
      case "email":
        return user.email;
      case "brands":
        return user.brands.length > 0 ? formatBrandLabel(user.brands[0]) : null;
      case "role":
        return user.roles.map((role) => roleLabels[role]).join(", ");
      case "createdAt":
        return user.createdAt.getTime();
      case "lastActiveAt":
        return user.lastActiveAt?.getTime() ?? null;
    }
  }

  const sortedUsers = $derived.by(() => {
    const sign = sortDirection === "asc" ? 1 : -1;
    return [...users].sort((a, b) => {
      const left = sortValue(a, sortField);
      const right = sortValue(b, sortField);
      if (left === null || right === null) {
        return left === right ? 0 : left === null ? 1 : -1;
      }
      return (
        sign *
        (typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right)))
      );
    });
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      return;
    }
    sortField = field;
    // Dates read best newest-first; text A to Z.
    sortDirection =
      field === "createdAt" || field === "lastActiveAt" ? "desc" : "asc";
  }

  function ariaSort(field: SortField) {
    if (sortField !== field) {
      return "none" as const;
    }
    return sortDirection === "asc"
      ? ("ascending" as const)
      : ("descending" as const);
  }
</script>

{#snippet sortHead(field: SortField, label: string, className: string)}
  <Table.Head class={className} aria-sort={ariaSort(field)}>
    <Button
      variant="ghost"
      size="sm"
      class="-mx-2"
      onclick={() => toggleSort(field)}
    >
      {label}
      {#if sortField !== field}
        <ArrowUpDownIcon data-icon="inline-end" />
      {:else if sortDirection === "asc"}
        <ArrowUpIcon data-icon="inline-end" />
      {:else}
        <ArrowDownIcon data-icon="inline-end" />
      {/if}
    </Button>
  </Table.Head>
{/snippet}

<Table.Root>
  <Table.Header>
    <Table.Row>
      {@render sortHead("name", "Name", "min-w-48")}
      {@render sortHead("email", "Email", "min-w-56")}
      {@render sortHead("brands", "Brands", "min-w-56")}
      {@render sortHead("role", "Role", "min-w-28")}
      {@render sortHead("createdAt", "Created At", "min-w-36")}
      {@render sortHead("lastActiveAt", "Last Active", "min-w-40")}
      <Table.Head class="min-w-28 text-right">Actions</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#if sortedUsers.length > 0}
      {#each sortedUsers as user (user.id)}
        <Table.Row class={["align-top", user.banned && "opacity-60"]}>
          <Table.Cell>
            <div class="space-y-1">
              <a
                href={`/admin/users/${user.id}`}
                class="font-medium tracking-[-0.01em] hover:underline"
              >
                {user.name}
              </a>
              {#if user.banned}
                <p class="text-destructive text-xs">Deactivated</p>
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
          <Table.Cell>
            {#if user.lastActiveAt}
              {dateTimeFormatter.format(user.lastActiveAt)}
            {:else}
              <span class="text-muted-foreground text-sm">Never</span>
            {/if}
          </Table.Cell>
          <Table.Cell>
            <div class="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onclick={() => onedituser(user)}
              >
                Edit
              </Button>
              {#if showHistory}
                <Button
                  variant="outline"
                  size="sm"
                  href={`/admin/live-monitoring/history/${user.id}`}
                >
                  History
                </Button>
              {/if}
              <UserActiveToggle {user} />
            </div>
          </Table.Cell>
        </Table.Row>
      {/each}
    {:else}
      <Table.Row>
        <Table.Cell
          colspan={7}
          class="text-muted-foreground py-12 text-center text-sm"
        >
          No users match the current filters.
        </Table.Cell>
      </Table.Row>
    {/if}
  </Table.Body>
</Table.Root>
