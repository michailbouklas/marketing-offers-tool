/**
 * Pure calendar-day helpers for page-view analytics. Days are `YYYY-MM-DD`
 * strings in the activity timezone (`ACTIVITY_TIMEZONE`); all arithmetic is
 * done on the date part only, so DST never shifts a day.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lower bound used for an open-ended ("All time") range. Earlier than any
 * recorded page view; keeps every query a simple bounded range.
 */
export const ALL_TIME_FROM = "2000-01-01";

export interface DayRange {
  from: string;
  to: string;
}

/** Inclusive day range split by data source. Either side may be absent. */
export interface DaySplit {
  /** Days served from the permanent rollup tables. */
  rollup: DayRange | null;
  /** Days served from raw `page_view` rows. */
  raw: DayRange | null;
}

function isValidDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Today's date in `timeZone`. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDay(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Resolve `?from=&to=` into an inclusive range. A missing or invalid `from`
 * means "from the beginning" and a missing `to` means "through today" — the
 * same convention as `DateRangeFilter`, whose "All time" preset sends neither.
 * A reversed range is swapped.
 */
export function resolveDayRange(
  from: string | null | undefined,
  to: string | null | undefined,
  today: string,
): DayRange {
  const validTo = to && isValidDay(to) ? to : today;
  const validFrom = from && isValidDay(from) ? from : ALL_TIME_FROM;

  return validFrom <= validTo
    ? { from: validFrom, to: validTo }
    : { from: validTo, to: validFrom };
}

/**
 * Split a range at the rollup cursor: days on or before `rolledUpThrough` come
 * from the rollup tables (raw rows may already be purged), later days from raw
 * rows (not rolled up yet).
 */
export function splitAtCursor(
  range: DayRange,
  rolledUpThrough: string | null,
): DaySplit {
  if (!rolledUpThrough || rolledUpThrough < range.from) {
    return { rollup: null, raw: range };
  }
  if (rolledUpThrough >= range.to) {
    return { rollup: range, raw: null };
  }
  return {
    rollup: { from: range.from, to: minDay(range.to, rolledUpThrough) },
    raw: {
      from: maxDay(range.from, addDays(rolledUpThrough, 1)),
      to: range.to,
    },
  };
}
