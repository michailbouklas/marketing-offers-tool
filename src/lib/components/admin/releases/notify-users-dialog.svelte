<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import MailIcon from "@lucide/svelte/icons/mail";
  import {
    RELEASE_RECIPIENTS_URL,
    releaseNotifyUrl,
    type ReleaseNotifyResult,
    type ReleaseRecipient,
    type ReleaseSummary,
  } from "$lib/services/releases/releases";

  /**
   * "Notify users" dialog: pick recipients and email them the rendered
   * release notes. Recipients are fetched on every open so the list is
   * current; nothing is pre-selected so a send is always a deliberate choice.
   */
  type Props = { release: ReleaseSummary | null; open?: boolean };

  let { release, open = $bindable(false) }: Props = $props();

  let recipients = $state<ReleaseRecipient[]>([]);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let mailConfigured = $state(true);
  let sending = $state(false);
  const selected = new SvelteSet<string>();

  const allSelected = $derived(
    recipients.length > 0 && recipients.every((r) => selected.has(r.id)),
  );
  const partiallySelected = $derived(
    !allSelected && recipients.some((r) => selected.has(r.id)),
  );
  const canSend = $derived(
    !!release && mailConfigured && !sending && !loading && selected.size > 0,
  );

  async function loadRecipients() {
    loading = true;
    loadError = null;
    try {
      const res = await fetch(RELEASE_RECIPIENTS_URL);
      if (!res.ok) {
        throw new Error(`Could not load users (${res.status}).`);
      }
      const data = (await res.json()) as {
        recipients: ReleaseRecipient[];
        mailConfigured: boolean;
      };
      recipients = data.recipients;
      mailConfigured = data.mailConfigured;
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Could not load users.";
      recipients = [];
    } finally {
      loading = false;
    }
  }

  // Fresh list + empty selection on every open.
  $effect(() => {
    if (!open || !release) {
      return;
    }
    selected.clear();
    void loadRecipients();
  });

  function toggleAll() {
    if (allSelected) {
      selected.clear();
    } else {
      for (const r of recipients) {
        selected.add(r.id);
      }
    }
  }

  function toggleRow(id: string) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
  }

  async function notify() {
    if (!release || !canSend) {
      return;
    }
    sending = true;
    try {
      const res = await fetch(releaseNotifyUrl(release.id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: [...selected] }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Sending failed (${res.status}).`);
      }
      const result = (await res.json()) as ReleaseNotifyResult;

      if (result.failed.length === 0) {
        toast.success(
          `Sent to ${result.sent} ${result.sent === 1 ? "user" : "users"}.`,
        );
        open = false;
        return;
      }

      const shown = result.failed.slice(0, 3).map((f) => f.email);
      const more = result.failed.length - shown.length;
      toast.warning(
        `Sent to ${result.sent}, failed for ${result.failed.length}: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`,
        { duration: 10_000 },
      );
      // Leave only the failed rows ticked so a retry targets exactly them.
      selected.clear();
      for (const f of result.failed) {
        selected.add(f.userId);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the emails.",
      );
    } finally {
      sending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-4 sm:max-w-[90vw]"
  >
    <Dialog.Header>
      <Dialog.Title>Notify users</Dialog.Title>
      <Dialog.Description>
        {#if release}
          Email the release notes for “{release.title}”
          <Badge variant="outline" class="font-mono">{release.version}</Badge>
          to the selected users. The subject is the release title.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if !mailConfigured}
      <Alert.Root variant="destructive">
        <Alert.Title>Email is not configured</Alert.Title>
        <Alert.Description>
          Set SMTP_HOST and NOTIFICATIONS_FROM_EMAIL on the server to enable
          notifications.
        </Alert.Description>
      </Alert.Root>
    {/if}

    {#if loadError}
      <Alert.Root variant="destructive">
        <Alert.Title>Could not load users</Alert.Title>
        <Alert.Description>{loadError}</Alert.Description>
      </Alert.Root>
    {/if}

    <div class="min-h-0 flex-1 overflow-y-auto rounded-md border">
      <Table.Root>
        <Table.Header class="bg-background sticky top-0 z-10">
          <Table.Row>
            <Table.Head class="w-12">
              <button
                type="button"
                class="inline-flex disabled:cursor-not-allowed"
                disabled={recipients.length === 0 || loading}
                onclick={toggleAll}
                aria-label="Select all users"
              >
                <Checkbox
                  checked={allSelected}
                  indeterminate={partiallySelected}
                  class="pointer-events-none"
                />
              </button>
            </Table.Head>
            <Table.Head>Full name</Table.Head>
            <Table.Head>Email</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if loading}
            {#each [1, 2, 3, 4] as n (n)}
              <Table.Row>
                <Table.Cell><Skeleton class="size-4" /></Table.Cell>
                <Table.Cell><Skeleton class="h-4 w-40" /></Table.Cell>
                <Table.Cell><Skeleton class="h-4 w-56" /></Table.Cell>
              </Table.Row>
            {/each}
          {:else}
            {#each recipients as user (user.id)}
              <Table.Row
                class="cursor-pointer"
                onclick={() => toggleRow(user.id)}
              >
                <Table.Cell>
                  <button
                    type="button"
                    class="inline-flex"
                    onclick={(event) => {
                      event.stopPropagation();
                      toggleRow(user.id);
                    }}
                    aria-label={`Select ${user.name ?? user.email}`}
                  >
                    <Checkbox
                      checked={selected.has(user.id)}
                      class="pointer-events-none"
                    />
                  </button>
                </Table.Cell>
                <Table.Cell class="font-medium">{user.name ?? "—"}</Table.Cell>
                <Table.Cell class="text-muted-foreground"
                  >{user.email}</Table.Cell
                >
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={3}
                  class="text-muted-foreground py-10 text-center text-sm"
                >
                  No users to notify.
                </Table.Cell>
              </Table.Row>
            {/each}
          {/if}
        </Table.Body>
      </Table.Root>
    </div>

    <Dialog.Footer class="items-center sm:justify-between">
      <p class="text-muted-foreground text-sm">
        {selected.size} of {recipients.length} selected
      </p>
      <div class="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onclick={() => (open = false)}
          disabled={sending}
        >
          Cancel
        </Button>
        <Button type="button" onclick={notify} disabled={!canSend}>
          {#if sending}
            <LoaderCircleIcon class="size-4 animate-spin" />
          {:else}
            <MailIcon class="size-4" />
          {/if}
          Notify
        </Button>
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
