<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { RangeCalendar } from "$lib/components/ui/range-calendar/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import {
    CalendarDate,
    getLocalTimeZone,
    startOfMonth,
    startOfWeek,
    startOfYear,
    today,
    type DateValue,
  } from "@internationalized/date";
  import type { DateRange } from "bits-ui";
  import { untrack } from "svelte";

  let {
    from,
    to,
    onApply,
  }: {
    from?: string | null;
    to?: string | null;
    onApply: (range: { from?: string; to?: string }) => void;
  } = $props();

  // Monday-first weeks (matches EU usage).
  const LOCALE = "en-GB";

  type PresetKey =
    | "all"
    | "this-week"
    | "last-week"
    | "last-month"
    | "last-quarter"
    | "ytd";

  const presetOptions: { value: PresetKey; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "this-week", label: "This week" },
    { value: "last-week", label: "Last week" },
    { value: "last-month", label: "Last month" },
    { value: "last-quarter", label: "Last quarter" },
    { value: "ytd", label: "Year to date" },
  ];

  function parseDay(
    value: string | null | undefined,
  ): CalendarDate | undefined {
    if (!value) {
      return undefined;
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return undefined;
    }
    return new CalendarDate(year, month, day);
  }

  function presetRange(key: PresetKey): {
    start?: DateValue;
    end?: DateValue;
  } {
    const now = today(getLocalTimeZone());

    switch (key) {
      case "this-week":
        return { start: startOfWeek(now, LOCALE), end: now };
      case "last-week": {
        const startThisWeek = startOfWeek(now, LOCALE);
        return {
          start: startThisWeek.subtract({ weeks: 1 }),
          end: startThisWeek.subtract({ days: 1 }),
        };
      }
      case "last-month": {
        const startThisMonth = startOfMonth(now);
        return {
          start: startThisMonth.subtract({ months: 1 }),
          end: startThisMonth.subtract({ days: 1 }),
        };
      }
      case "last-quarter": {
        const quarterIndex = Math.floor((now.month - 1) / 3);
        const startThisQuarter = new CalendarDate(
          now.year,
          quarterIndex * 3 + 1,
          1,
        );
        return {
          start: startThisQuarter.subtract({ months: 3 }),
          end: startThisQuarter.subtract({ days: 1 }),
        };
      }
      case "ytd":
        return { start: startOfYear(now), end: now };
      default:
        return { start: undefined, end: undefined };
    }
  }

  // Draft range edited inside the calendar popover; only committed on "Apply".
  // Initialised once from the props; kept in sync afterwards via the effect
  // below, so the initial-only read is intentional.
  let value = $state<DateRange>(
    untrack(() => ({ start: parseDay(from), end: parseDay(to) })),
  );
  let selectedPreset = $state<string>(
    untrack(() => (from || to ? "custom" : "all")),
  );
  let open = $state(false);

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // The trigger reflects the *applied* range from the URL (via props), so it
  // stays correct even after browser back/forward navigation.
  const triggerLabel = $derived.by(() => {
    const start = parseDay(from);
    const end = parseDay(to);
    if (start && end) {
      const startLabel = dateFormatter.format(start.toDate(getLocalTimeZone()));
      const endLabel = dateFormatter.format(end.toDate(getLocalTimeZone()));
      return startLabel === endLabel
        ? startLabel
        : `${startLabel} – ${endLabel}`;
    }
    return "All time";
  });

  // Whenever the popover opens, reset the draft to the applied range so the
  // calendar always starts from the current selection.
  $effect(() => {
    if (open) {
      value = { start: parseDay(from), end: parseDay(to) };
    }
  });

  const presetTriggerLabel = $derived(
    presetOptions.find((option) => option.value === selectedPreset)?.label ??
      "Custom range",
  );

  function applyPreset(key: string) {
    selectedPreset = key;

    if (key === "all") {
      value = { start: undefined, end: undefined };
      onApply({});
      return;
    }

    const range = presetRange(key as PresetKey);
    value = { start: range.start, end: range.end };
    onApply({ from: range.start?.toString(), to: range.end?.toString() });
  }

  function applyCustomRange() {
    if (!value.start || !value.end) {
      return;
    }
    selectedPreset = "custom";
    onApply({ from: value.start.toString(), to: value.end.toString() });
    open = false;
  }

  function clearRange() {
    selectedPreset = "all";
    value = { start: undefined, end: undefined };
    onApply({});
    open = false;
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <Select.Root type="single" value={selectedPreset} onValueChange={applyPreset}>
    <Select.Trigger class="w-[160px]">{presetTriggerLabel}</Select.Trigger>
    <Select.Content>
      {#each presetOptions as option (option.value)}
        <Select.Item value={option.value}>{option.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" class="justify-start font-normal">
          <CalendarIcon class="size-4" />
          {triggerLabel}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="end">
      <RangeCalendar bind:value numberOfMonths={2} />
      <div class="flex items-center justify-between gap-2 border-t p-3">
        <Button variant="ghost" size="sm" onclick={clearRange}>Clear</Button>
        <Button
          size="sm"
          onclick={applyCustomRange}
          disabled={!value.start || !value.end}
        >
          Apply range
        </Button>
      </div>
    </Popover.Content>
  </Popover.Root>
</div>
