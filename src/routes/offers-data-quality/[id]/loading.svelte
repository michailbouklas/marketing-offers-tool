<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <div class="h-4 w-52 animate-pulse rounded-full bg-zinc-200"></div>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div class="space-y-3">
        <div class="h-6 w-52 animate-pulse rounded-full bg-zinc-200"></div>
        <div
          class="h-14 w-full max-w-xl animate-pulse rounded-3xl bg-zinc-200"
        ></div>
      </div>
      <div
        class="h-28 animate-pulse rounded-3xl border border-zinc-200 bg-white/60"
      ></div>
    </section>

    <div
      class="h-20 animate-pulse rounded-3xl border border-zinc-200 bg-white/70"
    ></div>

    <div class="grid gap-5">
      <div
        class="animate-pulse rounded-3xl border border-zinc-200 bg-white/70 p-6"
      >
        <div class="mb-5 h-6 w-44 rounded-full bg-zinc-200"></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="h-11 rounded-xl bg-zinc-100"></div>
          <div class="h-11 rounded-xl bg-zinc-100"></div>
        </div>
      </div>

      <div
        class="animate-pulse rounded-3xl border border-zinc-200 bg-white/70 p-6"
      >
        <div class="mb-5 h-6 w-52 rounded-full bg-zinc-200"></div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each Array.from({ length: 6 }) as _}
            <div class="space-y-2">
              <div class="h-4 w-24 rounded-full bg-zinc-200"></div>
              <div class="h-11 rounded-xl bg-zinc-100"></div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </main>
</div>
