<script lang="ts">
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import OctagonXIcon from "@lucide/svelte/icons/octagon-x";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    scrapeStream,
    type ScrapeLanguage,
    type ScrapeMode,
  } from "$lib/state/scrape-stream.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let mode = $state<ScrapeMode>("all");
  let url = $state("");
  let language = $state<ScrapeLanguage>("en");

  const isRunning = $derived(scrapeStream.status === "running");
  // Show the start form only before/after a run, not while one is streaming.
  const showForm = $derived(!isRunning);

  let consoleEl = $state<HTMLDivElement | null>(null);

  const scrapeModeOptions = [
    { value: "all", label: "All registered URLs (full batch)" },
    { value: "single", label: "Single URL" },
  ] as const satisfies readonly { value: ScrapeMode; label: string }[];

  const scrapeLanguageOptions = [
    { value: "en", label: "English" },
    { value: "el", label: "Greek" },
  ] as const satisfies readonly { value: ScrapeLanguage; label: string }[];

  function isScrapeMode(value: string | undefined): value is ScrapeMode {
    if (!value) return false;

    return scrapeModeOptions.some((option) => option.value === value);
  }

  function isScrapeLanguage(value: string | undefined): value is ScrapeLanguage {
    if (!value) return false;

    return scrapeLanguageOptions.some((option) => option.value === value);
  }

  function getScrapeModeLabel(value: ScrapeMode) {
    const option = scrapeModeOptions.find((item) => item.value === value);

    if (!option) return "Select scrape scope";

    return option.label;
  }

  function getScrapeLanguageLabel(value: ScrapeLanguage) {
    const option = scrapeLanguageOptions.find((item) => item.value === value);

    if (!option) return "Select menu language";

    return option.label;
  }

  function updateScrapeMode(value: string | undefined) {
    if (!isScrapeMode(value)) return;

    mode = value;
  }

  function updateScrapeLanguage(value: string | undefined) {
    if (!isScrapeLanguage(value)) return;

    language = value;
  }

  // Auto-scroll the console to the newest line.
  $effect(() => {
    // Touch `lines` so the effect re-runs as output streams in.
    void scrapeStream.lines.length;
    if (consoleEl) {
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  });

  async function startScrape() {
    await scrapeStream.start(
      mode === "single"
        ? { mode, url: url.trim(), language }
        : { mode: "all", language },
    );
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] gap-4 overflow-hidden sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        {#if scrapeStream.status === "running"}
          <LoaderCircleIcon class="text-muted-foreground size-4 animate-spin" />
          Scrape in progress
        {:else if scrapeStream.status === "succeeded"}
          <CircleCheckIcon class="size-4 text-emerald-500" />
          Scrape completed
        {:else if scrapeStream.status === "failed"}
          <OctagonXIcon class="text-destructive size-4" />
          Scrape failed
        {:else}
          Scrape now
        {/if}
      </Dialog.Title>
      <Dialog.Description>
        Trigger an on-demand scrape and watch the live log. The run continues on
        the server even if you close this dialog or navigate away.
      </Dialog.Description>
    </Dialog.Header>

    {#if showForm}
      <div class="grid gap-4">
        <div class="grid gap-2">
          <Label for="scrape-mode">Scope</Label>
          <Select.Root type="single" value={mode} onValueChange={updateScrapeMode}>
            <Select.Trigger id="scrape-mode" class="w-full">
              {getScrapeModeLabel(mode)}
            </Select.Trigger>
            <Select.Content>
              {#each scrapeModeOptions as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        {#if mode === "single"}
          <div class="grid gap-2">
            <Label for="scrape-url">Restaurant URL</Label>
            <Input
              id="scrape-url"
              type="url"
              placeholder="https://www.foody.com.cy/delivery/menu/..."
              bind:value={url}
            />
          </div>
          <div class="grid gap-2">
            <Label for="scrape-language">Menu language</Label>
            <Select.Root
              type="single"
              value={language}
              onValueChange={updateScrapeLanguage}
            >
              <Select.Trigger id="scrape-language" class="w-full">
                {getScrapeLanguageLabel(language)}
              </Select.Trigger>
              <Select.Content>
                {#each scrapeLanguageOptions as option (option.value)}
                  <Select.Item value={option.value}>{option.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/if}
      </div>
    {/if}

    {#if scrapeStream.lines.length > 0 || isRunning}
      <div
        bind:this={consoleEl}
        class="bg-muted/40 h-72 overflow-y-auto rounded-lg border p-3 font-mono text-xs leading-5"
      >
        {#if scrapeStream.lines.length === 0}
          <p class="text-muted-foreground">Waiting for scraper output…</p>
        {:else}
          {#each scrapeStream.lines as line, index (index)}
            <p class="whitespace-pre-wrap">{line}</p>
          {/each}
        {/if}
      </div>
    {/if}

    {#if scrapeStream.status === "failed" && scrapeStream.error}
      <p class="text-destructive text-sm">{scrapeStream.error}</p>
    {/if}

    <Dialog.Footer>
      {#if showForm}
        <Button
          onclick={startScrape}
          disabled={mode === "single" && url.trim().length === 0}
        >
          {scrapeStream.status === "idle" ? "Start scrape" : "Run again"}
        </Button>
      {/if}
      <Button variant="outline" onclick={() => (open = false)}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
