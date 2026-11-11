/**
 * Shared types + pure helpers for /sales/hours (browser-safe): average sales
 * per weekday × hour, busy and dead hours, and the share of each daypart.
 * The ClickHouse read lives in `sales-hours.server.ts`.
 */

/** One weekday × hour bucket summed over the range. weekday: 1 = Mon … 7 = Sun (ClickHouse toDayOfWeek). */
export type SalesHourCell = {
  weekday: number;
  hour: number;
  net: number;
  txns: number;
};

/** An hour averaging under this share of the store's busiest hour is "dead". */
export const DEAD_HOUR_SHARE = 0.15;
/** Average orders per day an hour needs to count as a trading hour at all. */
export const MIN_TRADING_ORDERS = 1;

/** The POS business day rolls over around 05:00, so columns start there. */
export const BUSINESS_DAY_START_HOUR = 5;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const DAYPARTS = [
  { key: "breakfast", label: "Breakfast", from: 5, to: 11 },
  { key: "lunch", label: "Lunch", from: 11, to: 15 },
  { key: "afternoon", label: "Afternoon", from: 15, to: 18 },
  { key: "dinner", label: "Dinner", from: 18, to: 22 },
  { key: "late", label: "Late night", from: 22, to: 29 },
] as const;

export type HeatCell = {
  avgNet: number;
  avgTxns: number;
  atv: number | null;
  /** avgNet / busiest cell's avgNet, 0..1. */
  intensity: number;
  dead: boolean;
};

export type SalesHoursGrid = {
  /** Hours that had any sale, in business-day order (05 … 04). */
  hours: number[];
  /** rows[weekday - 1][index into hours]. */
  rows: HeatCell[][];
  peak: { weekday: number; hour: number; avgNet: number } | null;
  deadCount: number;
  dayparts: { key: string; label: string; net: number; share: number }[];
  /** "Group by day": weekdays[weekday - 1], whole-day averages; never dead (that rule is hourly). */
  weekdays: HeatCell[];
  peakDay: { weekday: number; avgNet: number } | null;
};

/** `?by=day` switches /sales/hours (and its export) to whole-day buckets. */
export const isGroupedByDay = (params: URLSearchParams) =>
  params.get("by") === "day";

/** `?by=day&view=dates`: one cell per calendar date instead of weekday averages. */
export const isDateView = (params: URLSearchParams) =>
  isGroupedByDay(params) && params.get("view") === "dates";

/** `?vs=1`: split every calendar cell by channel (only with no channel filter). */
export const isChannelVs = (params: URLSearchParams) =>
  params.get("vs") === "1";

/** One date × hour × channel, summed. */
export type SalesChannelRow = {
  day: string;
  hour: number;
  channel: string;
  net: number;
  txns: number;
};
export type ChannelValue = { channel: string; net: number; txns: number };
/** Keyed like the cells on screen: `weekday|hour`, `weekday`, or the ISO date. */
export type ChannelBreakdown = Record<string, ChannelValue[]>;

/**
 * Per-channel values for the current view, averaged per calendar day the same
 * way as the totals (hour/weekday views) or raw totals (date view). Channels
 * inside a cell are alphabetical so they line up from cell to cell.
 */
export function buildChannelBreakdown(
  rows: SalesChannelRow[],
  from: string,
  to: string,
  view: "hour" | "weekday" | "date",
): ChannelBreakdown {
  const days = weekdayCounts(from, to);
  const sums = new Map<
    string,
    { divisor: number; byChannel: Map<string, ChannelValue> }
  >();
  for (const row of rows) {
    const weekday =
      ((new Date(`${row.day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const key =
      view === "date"
        ? row.day
        : view === "weekday"
          ? `${weekday}`
          : `${weekday}|${row.hour}`;
    let entry = sums.get(key);
    if (!entry) {
      entry = {
        divisor: view === "date" ? 1 : days[weekday - 1] || 1,
        byChannel: new Map(),
      };
      sums.set(key, entry);
    }
    const value = entry.byChannel.get(row.channel) ?? {
      channel: row.channel,
      net: 0,
      txns: 0,
    };
    value.net += row.net;
    value.txns += row.txns;
    entry.byChannel.set(row.channel, value);
  }
  return Object.fromEntries(
    [...sums].map(([key, { divisor, byChannel }]) => [
      key,
      [...byChannel.values()]
        .map((value) => ({
          channel: value.channel,
          net: value.net / divisor,
          txns: value.txns / divisor,
        }))
        .sort((a, b) => a.channel.localeCompare(b.channel)),
    ]),
  );
}

/** One POS business day (`tran_date`, YYYY-MM-DD) summed. */
export type SalesDayCell = { day: string; net: number; txns: number };

export type CalendarCell = {
  date: string;
  /** Day of month, 1..31. */
  day: number;
  /** ISO weekday, 1 = Mon. */
  weekday: number;
  inRange: boolean;
  net: number;
  txns: number;
  atv: number | null;
  /** net / busiest in-range date's net, 0..1. */
  intensity: number;
};

export type SalesCalendar = {
  /** One block per month touched by [from, to], oldest first. */
  months: {
    key: string;
    label: string;
    /** Blank cells before the 1st in a Mon-first week. */
    offset: number;
    cells: CalendarCell[];
  }[];
  peak: { date: string; net: number } | null;
};

const DAY_MS = 86_400_000;
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);

export function buildSalesCalendar(
  days: SalesDayCell[],
  from: string,
  to: string,
): SalesCalendar {
  const byDate = new Map(days.map((day) => [day.day, day]));
  const start = Date.parse(`${from.slice(0, 8)}01T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  let peak: SalesCalendar["peak"] = null;
  const months: SalesCalendar["months"] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const date = isoDate(t);
    const weekday = ((new Date(t).getUTCDay() + 6) % 7) + 1;
    if (date.endsWith("-01")) {
      months.push({
        key: date.slice(0, 7),
        label: new Date(t).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        offset: weekday - 1,
        cells: [],
      });
    }
    const inRange = date >= from && date <= to;
    const row = inRange ? byDate.get(date) : undefined;
    const net = row?.net ?? 0;
    const txns = row?.txns ?? 0;
    if (net > (peak?.net ?? 0)) peak = { date, net };
    months[months.length - 1].cells.push({
      date,
      day: Number(date.slice(8)),
      weekday,
      inRange,
      net,
      txns,
      atv: txns > 0 ? net / txns : null,
      intensity: 0,
    });
  }

  // Finish the last month so the calendar never stops mid-week visually.
  const last = months[months.length - 1];
  if (last) {
    for (
      let t = end + DAY_MS;
      isoDate(t).slice(0, 7) === last.key;
      t += DAY_MS
    ) {
      const date = isoDate(t);
      last.cells.push({
        date,
        day: Number(date.slice(8)),
        weekday: ((new Date(t).getUTCDay() + 6) % 7) + 1,
        inRange: false,
        net: 0,
        txns: 0,
        atv: null,
        intensity: 0,
      });
    }
  }

  const peakNet = (peak as SalesCalendar["peak"])?.net ?? 0;
  for (const month of months) {
    for (const cell of month.cells) {
      cell.intensity = peakNet > 0 ? cell.net / peakNet : 0;
    }
  }
  return { months, peak };
}

/** Calendar days per ISO weekday (1 = Mon) in [from, to]. Closed days count as zero sales. */
export function weekdayCounts(from: string, to: string): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    counts[(new Date(t).getUTCDay() + 6) % 7] += 1;
  }
  return counts;
}

const businessOrder = (hour: number) =>
  (hour + 24 - BUSINESS_DAY_START_HOUR) % 24;

export function buildSalesHoursGrid(
  cells: SalesHourCell[],
  from: string,
  to: string,
): SalesHoursGrid {
  const days = weekdayCounts(from, to);
  const hours = [...new Set(cells.map((cell) => cell.hour))].sort(
    (a, b) => businessOrder(a) - businessOrder(b),
  );
  const byKey = new Map(
    cells.map((cell) => [`${cell.weekday}|${cell.hour}`, cell]),
  );

  let peak: SalesHoursGrid["peak"] = null;
  const raw = WEEKDAY_LABELS.map((_, index) =>
    hours.map((hour) => {
      const cell = byKey.get(`${index + 1}|${hour}`);
      const dayCount = days[index] || 1;
      const avgNet = (cell?.net ?? 0) / dayCount;
      const avgTxns = (cell?.txns ?? 0) / dayCount;
      if (avgNet > (peak?.avgNet ?? 0)) {
        peak = { weekday: index + 1, hour, avgNet };
      }
      return { avgNet, avgTxns, atv: avgTxns > 0 ? avgNet / avgTxns : null };
    }),
  );

  const peakNet = (peak as SalesHoursGrid["peak"])?.avgNet ?? 0;
  let deadCount = 0;
  const rows = raw.map((row) =>
    row.map((cell) => {
      // Under one order a day is a stray order in a closed hour, not a dead trading hour.
      const dead =
        cell.avgTxns >= MIN_TRADING_ORDERS &&
        cell.avgNet < peakNet * DEAD_HOUR_SHARE;
      if (dead) deadCount += 1;
      return {
        ...cell,
        intensity: peakNet > 0 ? cell.avgNet / peakNet : 0,
        dead,
      };
    }),
  );

  const total = cells.reduce((sum, cell) => sum + cell.net, 0);
  const dayparts = DAYPARTS.map((part) => {
    const net = cells
      .filter((cell) => {
        const h = businessOrder(cell.hour) + BUSINESS_DAY_START_HOUR;
        return h >= part.from && h < part.to;
      })
      .reduce((sum, cell) => sum + cell.net, 0);
    return {
      key: part.key,
      label: part.label,
      net,
      share: total > 0 ? net / total : 0,
    };
  });

  const dayTotals = WEEKDAY_LABELS.map((_, index) => {
    const dayCells = cells.filter((cell) => cell.weekday === index + 1);
    const dayCount = days[index] || 1;
    const avgNet = dayCells.reduce((sum, cell) => sum + cell.net, 0) / dayCount;
    const avgTxns =
      dayCells.reduce((sum, cell) => sum + cell.txns, 0) / dayCount;
    return { avgNet, avgTxns, atv: avgTxns > 0 ? avgNet / avgTxns : null };
  });
  const peakDayNet = Math.max(0, ...dayTotals.map((day) => day.avgNet));
  const peakIndex = dayTotals.findIndex((day) => day.avgNet === peakDayNet);
  const weekdays = dayTotals.map((day) => ({
    ...day,
    intensity: peakDayNet > 0 ? day.avgNet / peakDayNet : 0,
    dead: false,
  }));
  const peakDay =
    peakDayNet > 0 ? { weekday: peakIndex + 1, avgNet: peakDayNet } : null;

  return { hours, rows, peak, deadCount, dayparts, weekdays, peakDay };
}
