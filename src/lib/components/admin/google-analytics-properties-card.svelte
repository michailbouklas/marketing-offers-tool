<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    normalizeGoogleAnalyticsPropertyId,
    parseServiceAccountJson,
    type GoogleAnalyticsPropertyAdminRow,
  } from "$lib/services/google-analytics/google-analytics";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  type Props = {
    brandId: number;
    properties: GoogleAnalyticsPropertyAdminRow[];
    /** Admin / super user: may add, edit, verify and remove. */
    canManage: boolean;
    /** `GOOGLE_ANALYTICS_CREDENTIALS_KEY` is set on the server. */
    configured: boolean;
  };

  let { brandId, properties, canManage, configured }: Props = $props();

  const apiBase = $derived(`/api/admin/brands/${brandId}/google-analytics`);
  const formId = $props.id();

  let dialogOpen = $state(false);
  let editing = $state<GoogleAnalyticsPropertyAdminRow | null>(null);
  let formDisplayName = $state("");
  let formPropertyId = $state("");
  let formCredentials = $state("");
  let formActive = $state(true);
  let saving = $state(false);
  let credentialsFileInput = $state<HTMLInputElement | undefined>();

  let verifyingId = $state<string | null>(null);
  let removingId = $state<string | null>(null);

  // Live feedback on the pasted key: which service account it belongs to, or
  // why it cannot be used. The key itself is only ever sent to the server.
  const credentialsPreview = $derived.by(() => {
    if (formCredentials.trim().length === 0) {
      return null;
    }
    const parsed = parseServiceAccountJson(formCredentials);
    return parsed.ok
      ? { ok: true as const, email: parsed.value.client_email }
      : { ok: false as const, error: parsed.error };
  });

  const propertyIdPreview = $derived(
    formPropertyId.trim().length === 0
      ? null
      : normalizeGoogleAnalyticsPropertyId(formPropertyId),
  );

  const canSubmit = $derived.by(() => {
    if (saving || formDisplayName.trim().length === 0) {
      return false;
    }
    if (editing) {
      // Credentials are optional when editing (keep the stored key).
      return credentialsPreview === null || credentialsPreview.ok;
    }
    return propertyIdPreview !== null && credentialsPreview?.ok === true;
  });

  function openAdd() {
    editing = null;
    formDisplayName = "";
    formPropertyId = "";
    formCredentials = "";
    formActive = true;
    dialogOpen = true;
  }

  function openEdit(row: GoogleAnalyticsPropertyAdminRow) {
    editing = row;
    formDisplayName = row.displayName;
    formPropertyId = row.propertyId;
    formCredentials = "";
    formActive = row.active;
    dialogOpen = true;
  }

  async function readCredentialsFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      formCredentials = await file.text();
    } catch {
      toast.error("Could not read the selected file.");
    }
  }

  async function readErrorMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    try {
      const body = JSON.parse(text) as { message?: unknown };
      if (typeof body.message === "string") return body.message;
    } catch {
      // not JSON
    }
    return text || `Request failed: ${res.status}`;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    saving = true;
    try {
      const res = editing
        ? await fetch(`${apiBase}/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              displayName: formDisplayName.trim(),
              active: formActive,
              ...(formCredentials.trim().length > 0
                ? { credentialsJson: formCredentials }
                : {}),
            }),
          })
        : await fetch(apiBase, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              propertyId: formPropertyId.trim(),
              displayName: formDisplayName.trim(),
              credentialsJson: formCredentials,
            }),
          });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      toast.success(
        editing ? "Property updated." : "Google Analytics property added.",
      );
      dialogOpen = false;
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      saving = false;
    }
  }

  async function verify(row: GoogleAnalyticsPropertyAdminRow) {
    if (verifyingId) return;
    verifyingId = row.id;
    try {
      const res = await fetch(`${apiBase}/${row.id}/verify`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const body = (await res.json()) as { ok: boolean; error: string | null };
      if (body.ok) {
        toast.success(`Google accepted the key for "${row.displayName}".`);
      } else {
        toast.error(body.error ?? "Verification failed.");
      }
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      verifyingId = null;
    }
  }

  async function remove(row: GoogleAnalyticsPropertyAdminRow) {
    if (removingId) return;
    if (
      !confirm(
        `Remove "${row.displayName}" (GA4 property ${row.propertyId}) from this brand? The stored key is deleted.`,
      )
    ) {
      return;
    }
    removingId = row.id;
    try {
      const res = await fetch(`${apiBase}/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      toast.success("Property removed.");
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      removingId = null;
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  }
</script>

<Card.Root>
  <Card.Header
    class="flex flex-row flex-wrap items-start justify-between gap-3"
  >
    <div class="space-y-1.5">
      <Card.Title>Google Analytics properties</Card.Title>
      <Card.Description>
        GA4 properties shown on the Google Analytics dashboard for this brand.
        Each property needs its own service-account key; the key is stored
        encrypted and never shown again.
      </Card.Description>
    </div>
    {#if canManage}
      <Button size="sm" onclick={openAdd} disabled={!configured}>
        Add property
      </Button>
    {/if}
  </Card.Header>
  <Card.Content class="space-y-4">
    {#if !configured}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Title>Credential encryption is not configured</Alert.Title>
        <Alert.Description>
          Set <code>GOOGLE_ANALYTICS_CREDENTIALS_KEY</code> on the server before adding
          properties. Existing properties cannot be queried until it is set.
        </Alert.Description>
      </Alert.Root>
    {/if}

    {#if properties.length === 0}
      <p class="text-muted-foreground text-sm">
        No Google Analytics properties linked yet.
        {#if canManage && configured}
          Add one to make this brand appear on the dashboard.
        {/if}
      </p>
    {:else}
      <div class="overflow-x-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>GA4 property</Table.Head>
              <Table.Head>Service account</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Last verified</Table.Head>
              {#if canManage}
                <Table.Head class="text-right">Actions</Table.Head>
              {/if}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each properties as row (row.id)}
              <Table.Row>
                <Table.Cell class="font-medium">{row.displayName}</Table.Cell>
                <Table.Cell
                  ><code class="text-xs">{row.propertyId}</code></Table.Cell
                >
                <Table.Cell>
                  <span
                    class="block max-w-[16rem] truncate text-xs"
                    title={row.clientEmail}
                  >
                    {row.clientEmail}
                  </span>
                  {#if row.keyId}
                    <span class="text-muted-foreground block text-[0.65rem]">
                      key …{row.keyId.slice(-8)}
                    </span>
                  {/if}
                </Table.Cell>
                <Table.Cell>
                  <div class="flex flex-wrap items-center gap-1">
                    <Badge variant={row.active ? "default" : "outline"}>
                      {row.active ? "Active" : "Inactive"}
                    </Badge>
                    {#if row.lastError}
                      <Badge variant="destructive" title={row.lastError}>
                        Last check failed
                      </Badge>
                    {:else if row.lastVerifiedAt}
                      <Badge variant="secondary">Verified</Badge>
                    {/if}
                  </div>
                  {#if row.lastError}
                    <p
                      class="text-destructive mt-1 max-w-sm text-xs"
                      title={row.lastError}
                    >
                      {row.lastError}
                    </p>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-xs whitespace-nowrap">
                  {formatDateTime(row.lastVerifiedAt)}
                </Table.Cell>
                {#if canManage}
                  <Table.Cell class="text-right">
                    <div class="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!configured || verifyingId !== null}
                        onclick={() => verify(row)}
                      >
                        {verifyingId === row.id
                          ? "Testing…"
                          : "Test connection"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!configured}
                        onclick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="text-destructive"
                        disabled={removingId !== null}
                        onclick={() => remove(row)}
                      >
                        {removingId === row.id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </Table.Cell>
                {/if}
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>
        {editing
          ? "Edit Google Analytics property"
          : "Add Google Analytics property"}
      </Dialog.Title>
      <Dialog.Description>
        {#if editing}
          Rename, enable/disable, or replace the service-account key. Leave the
          key empty to keep the stored one.
        {:else}
          Paste the JSON key of a Google Cloud service account that has the
          <strong>Viewer</strong> role on this GA4 property, and enable the
          <em>Google Analytics Data API</em> in that project.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4" onsubmit={submit}>
      <div class="grid gap-2">
        <Label for="{formId}-name">Display name</Label>
        <Input
          id="{formId}-name"
          placeholder="e.g. Website (GA4)"
          maxlength={120}
          bind:value={formDisplayName}
        />
      </div>

      <div class="grid gap-2">
        <Label for="{formId}-property">GA4 property id</Label>
        <Input
          id="{formId}-property"
          placeholder="e.g. 123456789 or properties/123456789"
          bind:value={formPropertyId}
          disabled={editing !== null}
        />
        {#if editing}
          <p class="text-muted-foreground text-xs">
            The property id cannot be changed; remove and re-add the property
            instead.
          </p>
        {:else if formPropertyId.trim().length > 0 && propertyIdPreview === null}
          <p class="text-destructive text-xs">
            Must be numeric — find it under Admin → Property settings in Google
            Analytics.
          </p>
        {/if}
      </div>

      {#if editing}
        <div
          class="flex items-center justify-between gap-3 rounded-md border p-3"
        >
          <div class="space-y-0.5">
            <Label for="{formId}-active">Active</Label>
            <p class="text-muted-foreground text-xs">
              Inactive properties are hidden from the dashboard.
            </p>
          </div>
          <Switch id="{formId}-active" bind:checked={formActive} />
        </div>
      {/if}

      <div class="grid gap-2">
        <div class="flex items-center justify-between gap-2">
          <Label for="{formId}-credentials">
            Service-account JSON key{editing ? " (optional)" : ""}
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onclick={() => credentialsFileInput?.click()}
          >
            Choose file…
          </Button>
          <input
            bind:this={credentialsFileInput}
            type="file"
            accept="application/json,.json"
            class="hidden"
            onchange={readCredentialsFile}
          />
        </div>
        <Textarea
          id="{formId}-credentials"
          rows={6}
          class="font-mono text-xs"
          placeholder={'{ "type": "service_account", "client_email": "...", "private_key": "..." }'}
          bind:value={formCredentials}
          autocomplete="off"
          spellcheck={false}
        />
        {#if credentialsPreview}
          {#if credentialsPreview.ok}
            <p class="text-muted-foreground text-xs">
              Service account: <code>{credentialsPreview.email}</code>. Grant it
              Viewer access on the GA4 property.
            </p>
          {:else}
            <p class="text-destructive text-xs">{credentialsPreview.error}</p>
          {/if}
        {/if}
      </div>

      <Dialog.Footer>
        <Button
          type="button"
          variant="outline"
          onclick={() => (dialogOpen = false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add property"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
