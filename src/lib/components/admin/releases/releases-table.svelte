<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import MailIcon from "@lucide/svelte/icons/mail";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import {
    formatReleaseDate,
    type ReleaseSummary,
  } from "$lib/services/releases/releases";

  type Row = ReleaseSummary & { readCount: number };

  type Props = {
    releases: Row[];
    onOpen: (id: number) => void;
    /** Opens the release form pre-filled for a silent correction. */
    onEdit: (id: number) => void;
    /** Opens the "Notify users" email dialog for this release. */
    onNotify: (id: number) => void;
  };

  let { releases, onOpen, onEdit, onNotify }: Props = $props();
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
          <div class="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={() => onOpen(release.id)}
            >
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => onEdit(release.id)}
            >
              <PencilIcon class="size-4" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onclick={() => onNotify(release.id)}
            >
              <MailIcon class="size-4" />
              Notify users
            </Button>
          </div>
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
