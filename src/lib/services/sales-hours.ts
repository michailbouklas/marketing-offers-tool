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
};

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

  return { hours, rows, peak, deadCount, dayparts };
}
