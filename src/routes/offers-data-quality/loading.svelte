<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <div class="h-4 w-44 animate-pulse rounded-full bg-zinc-200"></div>
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
      <div class="space-y-3">
        <div class="h-6 w-44 animate-pulse rounded-full bg-zinc-200"></div>
        <div class="space-y-2">
          <div class="h-12 w-80 animate-pulse rounded-2xl bg-zinc-200"></div>
          <div
            class="h-5 w-full max-w-2xl animate-pulse rounded-full bg-zinc-100"
          ></div>
        </div>
      </div>
      <div
        class="h-28 animate-pulse rounded-3xl border border-zinc-200 bg-white/60"
      ></div>
    </section>

    <div
      class="animate-pulse rounded-3xl border border-zinc-200 bg-white/70 p-6"
    >
      <div class="mb-6 h-8 w-48 rounded-full bg-zinc-200"></div>
      <div class="space-y-3">
        {#each Array.from({ length: 5 }) as _}
          <div
            class="grid gap-3 rounded-2xl bg-zinc-50/90 p-4 md:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))_auto]"
          >
            <div class="h-10 rounded-xl bg-zinc-200"></div>
            <div class="h-10 rounded-xl bg-zinc-100"></div>
            <div class="h-10 rounded-xl bg-zinc-100"></div>
            <div class="h-10 rounded-xl bg-zinc-100"></div>
            <div class="h-10 rounded-xl bg-zinc-100"></div>
            <div class="h-10 rounded-xl bg-zinc-100"></div>
            <div class="h-10 rounded-xl bg-zinc-200"></div>
          </div>
        {/each}
      </div>
    </div>
  </main>
</div>
