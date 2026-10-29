<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatReleaseDate,
    type ReleaseSummary,
  } from "$lib/services/releases/releases";

  type Row = ReleaseSummary & { readCount: number };

  let { releases, onOpen }: { releases: Row[]; onOpen: (id: number) => void } =
    $props();
</script>

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.Head>Version</Table.Head>
      <Table.Head>Title</Table.Head>
      <Table.Head>Published by</Table.Head>
      <Table.Head>Published</Table.Head>
      <Table.Head class="text-right">Read by</Table.Head>
      <Table.Head></Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each releases as release (release.id)}
      <Table.Row>
        <Table.Cell>
          <Badge variant="outline" class="font-mono">{release.version}</Badge>
        </Table.Cell>
        <Table.Cell class="max-w-md truncate font-medium" title={release.title}>
          {release.title}
        </Table.Cell>
        <Table.Cell class="text-muted-foreground text-sm">
          {release.createdByName ?? "—"}
        </Table.Cell>
        <Table.Cell>{formatReleaseDate(release.createdAt)}</Table.Cell>
        <Table.Cell class="text-right">{release.readCount}</Table.Cell>
        <Table.Cell class="text-end">
          <Button
            variant="outline"
            size="sm"
            onclick={() => onOpen(release.id)}
          >
            View
          </Button>
        </Table.Cell>
      </Table.Row>
    {:else}
      <Table.Row>
        <Table.Cell colspan={6} class="text-muted-foreground text-center">
          No releases published yet. Create one to tell users what changed.
        </Table.Cell>
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
