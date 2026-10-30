<script lang="ts">
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    releaseReadersUrl,
    type ReleaseReader,
    type ReleaseSummary,
  } from "$lib/services/releases/releases";

  /** "Read by" dialog: who has read a release. Fetched on every open so it is current. */
  type Props = { release: ReleaseSummary | null; open?: boolean };

  let { release, open = $bindable(false) }: Props = $props();

  let readers = $state<ReleaseReader[]>([]);
  let loading = $state(false);
  let loadError = $state<string | null>(null);

  async function loadReaders(id: number) {
    loading = true;
    loadError = null;
    try {
      const res = await fetch(releaseReadersUrl(id));
      if (!res.ok) {
        throw new Error(`Could not load readers (${res.status}).`);
      }
      readers = (await res.json()) as ReleaseReader[];
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load readers.";
      readers = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!open || !release) {
      return;
    }
    void loadReaders(release.id);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Read by</Dialog.Title>
      <Dialog.Description>
        {#if release}
          Users who have read “{release.title}”
          <Badge variant="outline" class="font-mono">{release.version}</Badge>
          {#if !loading && !loadError}
            · {readers.length}
            {readers.length === 1 ? "user" : "users"}
          {/if}
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if loadError}
      <Alert.Root variant="destructive">
        <Alert.Title>Could not load readers</Alert.Title>
        <Alert.Description>{loadError}</Alert.Description>
      </Alert.Root>
    {/if}

    <div class="min-h-0 flex-1 overflow-y-auto rounded-md border">
      <Table.Root>
        <Table.Header class="bg-background sticky top-0 z-10">
          <Table.Row>
            <Table.Head>Full name</Table.Head>
            <Table.Head>Email</Table.Head>
            <Table.Head class="text-right">Read at</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if loading}
            {#each [1, 2, 3, 4] as n (n)}
              <Table.Row>
                <Table.Cell><Skeleton class="h-4 w-40" /></Table.Cell>
                <Table.Cell><Skeleton class="h-4 w-56" /></Table.Cell>
                <Table.Cell><Skeleton class="ml-auto h-4 w-32" /></Table.Cell>
              </Table.Row>
            {/each}
          {:else}
            {#each readers as reader (reader.id)}
              <Table.Row>
                <Table.Cell class="font-medium">{reader.name ?? "—"}</Table.Cell
                >
                <Table.Cell class="text-muted-foreground"
                  >{reader.email}</Table.Cell
                >
                <Table.Cell class="text-muted-foreground text-right text-sm">
                  {new Date(reader.readAt).toLocaleString()}
                </Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={3}
                  class="text-muted-foreground py-10 text-center text-sm"
                >
                  Nobody has read this release yet.
                </Table.Cell>
              </Table.Row>
            {/each}
          {/if}
        </Table.Body>
      </Table.Root>
    </div>
  </Dialog.Content>
</Dialog.Root>
