<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { superForm } from "sveltekit-superforms/client";
  import SkillEditorForm from "$lib/components/admin/skills/skill-editor-form.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { AgentSkillRow } from "$lib/services/skills/agent-skills.server";
  import { assistantLabel } from "$lib/services/skills/assistants";
  import {
    getDefaultSkillFormData,
    type SkillActionMessage,
  } from "$lib/services/skills/skill-editor-form";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let createOpen = $state(false);
  let createKey = $state(0);
  let editOpen = $state(false);
  let editing = $state<AgentSkillRow | null>(null);
  let deleteOpen = $state(false);
  let pendingDelete = $state<AgentSkillRow | null>(null);

  const existingNames = $derived(data.skills.map((skill) => skill.name));
  const editValues = $derived(getDefaultSkillFormData(editing));

  const {
    form: deleteForm,
    enhance: deleteEnhance,
    submitting: deleting,
  } = superForm(
    untrack(() => data.deleteForm),
    {
      id: "delete-skill",
      dataType: "json",
      applyAction: true,
      invalidateAll: true,
      onUpdated: ({ form }) => {
        const msg = form.message as SkillActionMessage | undefined;
        if (!msg) return;
        if (msg.type === "success") {
          deleteOpen = false;
          pendingDelete = null;
          toast.success(msg.text);
        } else {
          toast.error(msg.text);
        }
      },
    },
  );

  function openCreate() {
    createKey += 1;
    createOpen = true;
  }

  function openEdit(skill: AgentSkillRow) {
    editing = skill;
    editOpen = true;
  }

  function openDelete(skill: AgentSkillRow) {
    pendingDelete = skill;
    $deleteForm.id = skill.id;
    deleteOpen = true;
  }

  function handleSuccess(message: SkillActionMessage, mode: "create" | "edit") {
    if (mode === "create") createOpen = false;
    else editOpen = false;
    toast.success(message.text);
  }

  $effect(() => {
    if (!editOpen) editing = null;
  });

  const formatDate = (value: Date | string) =>
    new Date(value).toLocaleDateString();
</script>

<svelte:head>
  <title>Agent skills | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Create SKILL.md instructions the AI assistants load on demand and choose which assistants receive each skill."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <p class="text-muted-foreground text-sm">Administration</p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Agent skills
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Custom SKILL.md instructions the AI assistants load on demand. Each
          skill is written to the Mastra workspace for the assistants you assign
          it to, at save time and at startup.
          {#if !data.isSuperUser}
            You see the skills you created; super users see everyone's.
          {/if}
        </p>
      </div>
      <Button onclick={openCreate}>New skill</Button>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">Skills</Card.Title>
        <Card.Description>
          {data.skills.length}
          {data.skills.length === 1 ? "skill" : "skills"}
          {#if data.builtInNames.length > 0}
            · built-in (reserved names): {data.builtInNames.join(", ")}
          {/if}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>Description</Table.Head>
              <Table.Head>Assistants</Table.Head>
              <Table.Head>Tags</Table.Head>
              <Table.Head class="text-right">References</Table.Head>
              <Table.Head>User-invocable</Table.Head>
              {#if data.isSuperUser}
                <Table.Head>Created by</Table.Head>
              {/if}
              <Table.Head>Updated</Table.Head>
              <Table.Head></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.skills as skill (skill.id)}
              <Table.Row>
                <Table.Cell
                  ><code class="text-xs">{skill.name}</code></Table.Cell
                >
                <Table.Cell class="max-w-md truncate" title={skill.description}>
                  {skill.description}
                </Table.Cell>
                <Table.Cell>
                  <div class="flex flex-wrap items-center gap-1">
                    {#each skill.agentIds as agentId (agentId)}
                      <Badge variant="outline">{assistantLabel(agentId)}</Badge>
                    {/each}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div class="flex flex-wrap items-center gap-1">
                    {#each skill.tags as tag (tag)}
                      <Badge variant="secondary">{tag}</Badge>
                    {/each}
                  </div>
                </Table.Cell>
                <Table.Cell class="text-right">
                  {skill.referenceFiles.length}
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    variant={skill.userInvocable ? "secondary" : "outline"}
                  >
                    {skill.userInvocable ? "yes" : "no"}
                  </Badge>
                </Table.Cell>
                {#if data.isSuperUser}
                  <Table.Cell class="text-muted-foreground text-sm">
                    {skill.createdBy?.name ?? skill.createdBy?.email ?? "—"}
                  </Table.Cell>
                {/if}
                <Table.Cell>{formatDate(skill.updatedAt)}</Table.Cell>
                <Table.Cell class="text-end">
                  <div class="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => openEdit(skill)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onclick={() => openDelete(skill)}
                    >
                      Delete
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={data.isSuperUser ? 9 : 8}
                  class="text-muted-foreground text-center"
                >
                  No custom skills yet. Create one to extend what the assistants
                  know.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <Dialog.Root bind:open={createOpen}>
      <Dialog.Content
        class="max-h-[90vh] w-[90vw] max-w-[90vw] overflow-y-auto sm:max-w-[90vw]"
      >
        <Dialog.Header>
          <Dialog.Title>New skill</Dialog.Title>
          <Dialog.Description>
            Skills are SKILL.md instructions the AI assistants load on demand.
            The description decides when an assistant picks the skill; the
            instructions tell it what to do.
          </Dialog.Description>
        </Dialog.Header>
        {#key createKey}
          <SkillEditorForm
            form={data.createForm}
            mode="create"
            action="?/createSkill"
            assistants={data.assistants}
            builtInNames={data.builtInNames}
            {existingNames}
            onSuccess={(message) => handleSuccess(message, "create")}
          />
        {/key}
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={editOpen}>
      <Dialog.Content
        class="max-h-[90vh] w-[90vw] max-w-[90vw] overflow-y-auto sm:max-w-[90vw]"
      >
        <Dialog.Header>
          <Dialog.Title>Edit skill</Dialog.Title>
          <Dialog.Description>
            Changes reach the assigned assistants on their next message.
          </Dialog.Description>
        </Dialog.Header>
        {#key editing?.id}
          <SkillEditorForm
            form={data.editForm}
            mode="edit"
            action="?/updateSkill"
            assistants={data.assistants}
            builtInNames={data.builtInNames}
            {existingNames}
            values={editValues}
            skillId={editing?.id ?? null}
            onSuccess={(message) => handleSuccess(message, "edit")}
          />
        {/key}
      </Dialog.Content>
    </Dialog.Root>

    <AlertDialog.Root bind:open={deleteOpen}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>
            Delete skill "{pendingDelete?.name}"?
          </AlertDialog.Title>
          <AlertDialog.Description>
            This removes it from
            {pendingDelete?.agentIds.map(assistantLabel).join(", ")}
            immediately. This cannot be undone.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <form method="POST" action="?/deleteSkill" use:deleteEnhance>
          <AlertDialog.Footer>
            <AlertDialog.Cancel type="button">Cancel</AlertDialog.Cancel>
            <Button type="submit" variant="destructive" disabled={$deleting}>
              Delete
            </Button>
          </AlertDialog.Footer>
        </form>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </main>
</div>
