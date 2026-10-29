<script lang="ts">
  import { toast } from "svelte-sonner";
  import ReleaseFormDialog from "$lib/components/admin/releases/release-form-dialog.svelte";
  import ReleasesTable from "$lib/components/admin/releases/releases-table.svelte";
  import ReleaseDialog from "$lib/components/releases/release-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { ReleaseActionMessage } from "$lib/services/releases/release-form";
  import {
    releaseDetailUrl,
    type ReleaseDetail,
  } from "$lib/services/releases/releases";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let createOpen = $state(false);
  let viewOpen = $state(false);
  let viewing = $state<ReleaseDetail | null>(null);
  let viewLoading = $state(false);
  const cache = new Map<number, ReleaseDetail>();

  function openCreate() {
    createOpen = true;
  }

  function handleResult(result: ReleaseActionMessage) {
    if (result.type === "success") {
      createOpen = false;
      toast.success(result.text);
    } else {
      toast.error(result.text);
    }
  }

  async function openRelease(id: number) {
    viewing = cache.get(id) ?? null;
    viewLoading = viewing === null;
    viewOpen = true;
    if (viewing) return;
    try {
      const res = await fetch(releaseDetailUrl(id));
      if (!res.ok) throw new Error(`Failed to load release (${res.status}).`);
      const detail = (await res.json()) as ReleaseDetail;
      cache.set(id, detail);
      viewing = detail;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load the release.",
      );
      viewOpen = false;
    } finally {
      viewLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Release notes | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Publish release notes that every user sees on their next sign-in."
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
          Release notes
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Tell users what changed. A published release shows up as a dialog on
          their next sign-in and in the "What's new" menu in the header; anyone
          already logged in gets a prompt to refresh.
        </p>
        <p class="text-muted-foreground flex items-center gap-2 text-sm">
          Current build
          <Badge variant="outline" class="font-mono">{data.buildVersion}</Badge>
        </p>
      </div>
      <Button onclick={openCreate}>New release</Button>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">Releases</Card.Title>
        <Card.Description>
          {data.releases.length}
          {data.releases.length === 1 ? "release" : "releases"} published
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <ReleasesTable releases={data.releases} onOpen={openRelease} />
      </Card.Content>
    </Card.Root>
  </main>
</div>

<ReleaseFormDialog
  form={data.createForm}
  buildVersion={data.buildVersion}
  bind:open={createOpen}
  onResult={handleResult}
/>

<ReleaseDialog release={viewing} bind:open={viewOpen} loading={viewLoading} />
