<script lang="ts">
  import { enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import { scaleUtc } from "d3-scale";
  import { LineChart, Spline } from "layerchart";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import UserActiveToggle from "$lib/components/admin/user-active-toggle.svelte";
  import UserEditorForm from "$lib/components/admin/user-editor-form.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { adminUserRole, roleLabels } from "$lib/auth/roles";
  import { formatBrandLabel } from "$lib/services/brands";
  import { formatDuration } from "$lib/services/page-views/page-views";
  import { getDefaultEditUserFormData } from "$lib/services/user-editor-form";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let editOpen = $state(false);

  const user = $derived(data.profile);
  const usage = $derived(data.usage);
  const historyHref = $derived(`/admin/live-monitoring/history/${user.id}`);
  const editValues = $derived(getDefaultEditUserFormData(user));

  const numberFormatter = new Intl.NumberFormat();
  const percentFormatter = new Intl.NumberFormat("en-GB", { style: "percent" });

  // ISO weekdays: 1 = Monday ... 7 = Sunday, matching the SQL EXTRACT(ISODOW).
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const heatmapRows = $derived(
    weekdayLabels.map((label, index) => {
      const hours = Array<number>(24).fill(0);
      for (const cell of usage?.heatmap.cells ?? []) {
        if (cell.weekday === index + 1) {
          hours[cell.hour] = cell.views;
        }
      }
      return { label, hours };
    }),
  );
  const heatmapMax = $derived(
    Math.max(0, ...(usage?.heatmap.cells ?? []).map((cell) => cell.views)),
  );
  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  });
  // `YYYY-MM-DD` is a calendar day; format as UTC so it never shifts.
  const dayFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  const chartConfig = {
    pageViews: { label: "Page views", color: "var(--chart-1)" },
    visits: { label: "Visits", color: "var(--chart-2)" },
  } satisfies Chart.ChartConfig;

  const series = [
    { key: "pageViews", label: "Page views", color: "var(--color-pageViews)" },
    { key: "visits", label: "Visits", color: "var(--color-visits)" },
  ];

  const chartData = $derived(
    (usage?.daily ?? []).map((point) => ({
      date: new Date(`${point.day}T00:00:00Z`),
      pageViews: point.pageViews,
      visits: point.visits,
    })),
  );

  const axisTicks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(chartData.length / 8));
    return chartData.filter((_, i) => i % step === 0).map((p) => p.date);
  });

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  function formatDay(day: string) {
    return dayFormatter.format(new Date(`${day}T00:00:00Z`));
  }
</script>

<svelte:head>
  <title>{user.name} | Users | Aggregator Offers Tool</title>
</svelte:head>

<main
  class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
>
  <section
    class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
  >
    <div class="space-y-2">
      <p
        class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
      >
        User
      </p>
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        {user.name}
      </h1>
      <p class="text-muted-foreground flex flex-wrap items-center gap-2">
        {user.email}
        {#each user.roles as role (role)}
          <Badge variant={role === adminUserRole ? "default" : "secondary"}>
            {roleLabels[role]}
          </Badge>
        {/each}
        {#if user.banned}
          <Badge variant="destructive">Deactivated</Badge>
        {/if}
      </p>
      <p class="text-muted-foreground text-sm">
        Created {dateFormatter.format(user.createdAt)}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each user.brands as brand (brand.id)}
          <Badge variant="outline">{formatBrandLabel(brand)}</Badge>
        {:else}
          <span class="text-muted-foreground text-sm">No brands assigned</span>
        {/each}
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button href="/admin/users" variant="outline">
        <ArrowLeftIcon class="size-4" />
        All users
      </Button>
      {#if data.isSuperUser}
        <Button href={historyHref} variant="outline">History</Button>
      {/if}
      <Button onclick={() => (editOpen = true)}>Edit user</Button>
      <UserActiveToggle {user} size="default" />
    </div>
  </section>

  {#if usage}
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {#each [{ label: "Visits", value: numberFormatter.format(usage.totals.visits) }, { label: "Page views", value: numberFormatter.format(usage.totals.pageViews) }, { label: "Time on app", value: formatDuration(usage.totals.foregroundMs) }, { label: "Last active", value: usage.lastActiveDay ? formatDay(usage.lastActiveDay) : "—" }] as stat (stat.label)}
        <Card.Root class="border-border/70">
          <Card.Header>
            <Card.Description>{stat.label}</Card.Description>
            <Card.Title class="text-2xl tabular-nums">{stat.value}</Card.Title>
          </Card.Header>
        </Card.Root>
      {/each}
    </section>

    <Card.Root class="border-border/70">
      <Card.Header>
        <Card.Title>Activity over time</Card.Title>
        <Card.Description>
          Daily visits and page views, {formatDay(usage.range.from)} – {formatDay(
            usage.range.to,
          )}.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if usage.totals.pageViews === 0}
          <p class="text-muted-foreground py-10 text-center text-sm">
            No recorded activity in this period.
          </p>
        {:else}
          <Chart.Container config={chartConfig} class="h-72 w-full">
            <LineChart
              data={chartData}
              x="date"
              xScale={scaleUtc()}
              yPadding={[0, 16]}
              {series}
              legend
              props={{ xAxis: { format: formatAxis, ticks: axisTicks } }}
            >
              {#snippet marks({ context })}
                {#each context.series.visibleSeries as s (s.key)}
                  <Spline seriesKey={s.key} class="stroke-2" stroke={s.color} />
                {/each}
              {/snippet}
              {#snippet tooltip()}
                <Chart.Tooltip indicator="dot" />
              {/snippet}
            </LineChart>
          </Chart.Container>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-border/70">
      <Card.Header>
        <Card.Title>Most used pages</Card.Title>
        <Card.Description>
          Top pages in the same period. <a href={historyHref} class="underline"
            >Open full history</a
          >
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Page</Table.Head>
              <Table.Head class="text-right">Views</Table.Head>
              <Table.Head class="text-right">Time in front</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each usage.topRoutes as route (route.routeId)}
              <Table.Row>
                <Table.Cell class="font-mono text-xs">
                  {route.routeId || "Unknown page (404)"}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {numberFormatter.format(route.views)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatDuration(route.foregroundMs)}
                </Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={3}
                  class="text-muted-foreground py-8 text-center text-sm"
                >
                  No pages visited in this period.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <section class="grid gap-6 lg:grid-cols-2">
      <Card.Root class="border-border/70">
        <Card.Header>
          <Card.Title>Work produced</Card.Title>
          <Card.Description>
            What they created or changed in the same period. Page views show
            presence; these show output.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {#each [{ label: "Images generated", value: usage.work.images, href: `/image-generator/${user.id}` }, { label: "Copy generated", value: usage.work.copies, href: null }, { label: "AI chats started", value: usage.work.chats, href: `/admin/chat-usage/${user.id}` }, { label: "Offer changes", value: usage.work.offerChanges, href: null }, { label: "Prices submitted", value: usage.work.submissions, href: null }, { label: "Prices approved", value: usage.work.approvals, href: null }] as item (item.label)}
              <div class="flex items-baseline justify-between gap-2">
                <dt class="text-muted-foreground">
                  {#if item.href}
                    <a href={item.href} class="hover:underline">{item.label}</a>
                  {:else}
                    {item.label}
                  {/if}
                </dt>
                <dd class="font-medium tabular-nums">
                  {numberFormatter.format(item.value)}
                </dd>
              </div>
            {/each}
          </dl>
        </Card.Content>
      </Card.Root>

      <Card.Root class="border-border/70">
        <Card.Header>
          <Card.Title>Sections used</Card.Title>
          <Card.Description>
            Share of page views per app section. A section they hold access to
            but never open may be access they do not need.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          {#each usage.sections as row (row.section)}
            <div class="space-y-1">
              <div class="flex justify-between gap-2 text-sm">
                <span class="font-mono text-xs">
                  {row.section === "/"
                    ? "Home"
                    : row.section || "Unknown page (404)"}
                </span>
                <span class="text-muted-foreground tabular-nums">
                  {percentFormatter.format(row.share)} · {numberFormatter.format(
                    row.views,
                  )}
                  {row.views === 1 ? "view" : "views"}
                </span>
              </div>
              <div class="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  class="bg-primary h-full rounded-full"
                  style:width={`${row.share * 100}%`}
                ></div>
              </div>
            </div>
          {:else}
            <p class="text-muted-foreground text-sm">
              No pages visited in this period.
            </p>
          {/each}
        </Card.Content>
      </Card.Root>
    </section>

    <Card.Root class="border-border/70">
      <Card.Header>
        <Card.Title>When they work</Card.Title>
        <Card.Description>
          Page views started per weekday and hour ({usage.timeZone}), {formatDay(
            usage.heatmap.coveredFrom,
          )} – {formatDay(usage.range.to)}.
          {#if usage.heatmap.coveredFrom > usage.range.from}
            Older detail is purged, so this covers a shorter period than the
            stats above.
          {/if}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if heatmapMax === 0}
          <p class="text-muted-foreground py-6 text-center text-sm">
            No recorded activity in this period.
          </p>
        {:else}
          <div class="overflow-x-auto">
            <div
              class="grid min-w-[40rem] grid-cols-[3rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px]"
            >
              <div></div>
              {#each { length: 24 } as _, hour (hour)}
                <div class="text-muted-foreground text-center tabular-nums">
                  {hour % 3 === 0 ? hour : ""}
                </div>
              {/each}
              {#each heatmapRows as row (row.label)}
                <div class="text-muted-foreground self-center pr-1">
                  {row.label}
                </div>
                {#each row.hours as views, hour (hour)}
                  <div
                    class={[
                      "aspect-square rounded-[2px]",
                      views > 0 ? "bg-primary" : "bg-muted",
                    ]}
                    style:opacity={views > 0
                      ? 0.2 + 0.8 * (views / heatmapMax)
                      : 1}
                    title={`${row.label} ${String(hour).padStart(2, "0")}:00 · ${views} ${views === 1 ? "view" : "views"}`}
                  ></div>
                {/each}
              {/each}
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-border/70">
      <Card.Header>
        <Card.Title>Release notes</Card.Title>
        <Card.Description>
          Read {usage.releases.read} of {usage.releases.total} published release notes.
          <a href="/admin/features" class="underline">Manage releases</a>
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Release</Table.Head>
              <Table.Head>Published</Table.Head>
              <Table.Head class="text-right">Read</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each usage.releases.recent as release (release.id)}
              <Table.Row>
                <Table.Cell>
                  <p class="font-medium">{release.title}</p>
                  <p class="text-muted-foreground font-mono text-xs">
                    {release.version}
                  </p>
                </Table.Cell>
                <Table.Cell>
                  {dateFormatter.format(new Date(release.createdAt))}
                </Table.Cell>
                <Table.Cell class="text-right">
                  {#if release.readAt}
                    {dateTimeFormatter.format(new Date(release.readAt))}
                  {:else}
                    <Badge variant="outline">Unread</Badge>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={3}
                  class="text-muted-foreground py-8 text-center text-sm"
                >
                  No release notes published yet.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-border/70">
      <Card.Header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1.5">
            <Card.Title>Active sessions</Card.Title>
            <Card.Description>
              Signed-in browsers that have not expired. Use "Sign out
              everywhere" for a lost device or a suspicious sign-in.
            </Card.Description>
          </div>
          {#if usage.sessions.length > 0}
            <form
              method="POST"
              action="?/revokeSessions"
              use:enhance={() =>
                async ({ result, update }) => {
                  if (result.type === "success") {
                    toast.success(`${user.name} signed out everywhere.`);
                  } else if (result.type === "failure") {
                    toast.error(
                      String(result.data?.error ?? "Unable to sign out."),
                    );
                  }
                  await update();
                }}
            >
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" variant="outline">
                Sign out everywhere
              </Button>
            </form>
          {/if}
        </div>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Device</Table.Head>
              <Table.Head>IP address</Table.Head>
              <Table.Head>Signed in</Table.Head>
              <Table.Head>Last refreshed</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each usage.sessions as session (session.id)}
              <Table.Row>
                <Table.Cell class="max-w-md">
                  <p class="truncate text-xs" title={session.userAgent ?? ""}>
                    {session.userAgent ?? "Unknown device"}
                  </p>
                  {#if session.impersonatedBy}
                    <Badge variant="destructive" class="mt-1">
                      Impersonated by an admin
                    </Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell class="font-mono text-xs">
                  {session.ipAddress ?? "—"}
                </Table.Cell>
                <Table.Cell
                  >{dateTimeFormatter.format(session.createdAt)}</Table.Cell
                >
                <Table.Cell
                  >{dateTimeFormatter.format(session.updatedAt)}</Table.Cell
                >
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={4}
                  class="text-muted-foreground py-8 text-center text-sm"
                >
                  No active sessions.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}

  <Dialog.Root bind:open={editOpen}>
    <Dialog.Content class="sm:max-w-2xl">
      <Dialog.Header>
        <Dialog.Title>Edit User</Dialog.Title>
        <Dialog.Description>Update account details.</Dialog.Description>
      </Dialog.Header>

      <UserEditorForm
        form={data.editForm}
        mode="edit"
        action="?/updateUser"
        brands={data.brands}
        values={editValues}
        userId={user.id}
        onSuccess={() => {
          editOpen = false;
          toast.success("User updated.");
        }}
      />
    </Dialog.Content>
  </Dialog.Root>
</main>
