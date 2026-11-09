import { startOfWeek } from "./sales-dashboard";
import type { OfferValue } from "./sales-offers";

/**
 * Shared types + pure helpers for /sales/delivery (browser-safe): sales on
 * aggregator / delivery channels only. ClickHouse reads live in
 * `sales-delivery.server.ts`.
 */

/**
 * `trim(dim_division_group_channel)` values that count as delivery. Trimmed
 * because Foody is stored both as "Foody" and "Foody " (trailing space).
 * Own-fleet delivery (Call Center / Online with group Delivery) is out of scope.
 */
export const DELIVERY_CHANNELS = [
  "Wolt",
  "Wolt GR",
  "Bolt",
  "Foody",
  "Efood",
  "Skroutz GR",
  "Delivery Man",
  "Radyes",
];

/** One day × channel; orders = POS transactions (pickup via the app included). */
export type DeliveryDayRow = {
  day: string;
  channel: string;
  net: number;
  gross: number;
  discount: number;
  orders: number;
};

export type DeliveryLocationRow = {
  location: string;
  channel: string;
  net: number;
  orders: number;
};

export type DeliveryTotals = {
  net: number;
  gross: number;
  discount: number;
  orders: number;
  atv: number | null;
};

const DAY_MS = 86_400_000;

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
}

const atv = (net: number, orders: number) =>
  orders === 0 ? null : net / orders;

/** The URL `channel` param, only if it is a known delivery channel. */
export function resolveDeliveryChannel(value: string | null): string | null {
  return value && DELIVERY_CHANNELS.includes(value) ? value : null;
}

/** First day of `to`'s month: the server must query from min(from, this). */
export function monthStart(to: string): string {
  return `${to.slice(0, 8)}01`;
}

function totals(rows: DeliveryDayRow[]): DeliveryTotals {
  const sum = { net: 0, gross: 0, discount: 0, orders: 0 };
  for (const row of rows) {
    sum.net += row.net;
    sum.gross += row.gross;
    sum.discount += row.discount;
    sum.orders += row.orders;
  }
  return { ...sum, atv: atv(sum.net, sum.orders) };
}

/**
 * Every widget from the day × channel rows. `days` may start before `from`
 * (MTD needs the whole month of `to`); `channel` null means all channels.
 * The channel list and shares always cover every channel in the range so the
 * buttons and donut stay put when one channel is selected.
 */
export function buildDeliveryDashboard(input: {
  days: DeliveryDayRow[];
  locations: DeliveryLocationRow[];
  from: string;
  to: string;
  channel: string | null;
}) {
  const { from, to, channel } = input;
  const inRange = input.days.filter((r) => r.day >= from && r.day <= to);
  const selected = inRange.filter((r) => !channel || r.channel === channel);

  const byChannel = new Map<string, number>();
  for (const row of inRange) {
    byChannel.set(row.channel, (byChannel.get(row.channel) ?? 0) + row.net);
  }
  const channelTotal = [...byChannel.values()].reduce((a, b) => a + b, 0);
  const channels = [...byChannel]
    .map(([name, net]) => ({
      channel: name,
      net,
      share: channelTotal === 0 ? 0 : net / channelTotal,
    }))
    .sort((a, b) => b.net - a.net);

  const byDay = new Map<string, { net: number; orders: number }>();
  for (const row of selected) {
    const day = byDay.get(row.day) ?? { net: 0, orders: 0 };
    day.net += row.net;
    day.orders += row.orders;
    byDay.set(row.day, day);
  }
  const daily: {
    day: string;
    net: number;
    orders: number;
    atv: number | null;
  }[] = [];
  for (let day = from; day <= to; day = nextDay(day)) {
    const value = byDay.get(day) ?? { net: 0, orders: 0 };
    daily.push({ day, ...value, atv: atv(value.net, value.orders) });
  }

  const byMonth = new Map<string, { net: number; orders: number }>();
  for (const day of daily) {
    const key = `${day.day.slice(0, 7)}-01`;
    const month = byMonth.get(key) ?? { net: 0, orders: 0 };
    month.net += day.net;
    month.orders += day.orders;
    byMonth.set(key, month);
  }

  const byLocation = new Map<string, { net: number; orders: number }>();
  for (const row of input.locations) {
    if (channel && row.channel !== channel) continue;
    const location = byLocation.get(row.location) ?? { net: 0, orders: 0 };
    location.net += row.net;
    location.orders += row.orders;
    byLocation.set(row.location, location);
  }
  const locationTotal = [...byLocation.values()].reduce((a, b) => a + b.net, 0);

  return {
    channels,
    range: totals(selected),
    mtd: totals(
      input.days.filter(
        (r) =>
          r.day >= monthStart(to) &&
          r.day <= to &&
          (!channel || r.channel === channel),
      ),
    ),
    daily,
    monthly: [...byMonth].map(([month, value]) => ({ month, ...value })),
    locations: [...byLocation]
      .map(([location, value]) => ({
        location,
        ...value,
        atv: atv(value.net, value.orders),
        share: locationTotal === 0 ? 0 : value.net / locationTotal,
      }))
      .sort((a, b) => b.net - a.net),
  };
}

export type DeliveryDashboard = ReturnType<typeof buildDeliveryDashboard>;

/**
 * Channel VS from the same day × channel and location × channel rows as the
 * overview. `requested` is kept to channels with sales in the range; fewer
 * than two falls back to the top two by net. Series are indexed like
 * `channels`.
 */
export function buildChannelVs(input: {
  days: DeliveryDayRow[];
  locations: DeliveryLocationRow[];
  from: string;
  to: string;
  requested: string[];
}) {
  const { from, to } = input;
  const inRange = input.days.filter((r) => r.day >= from && r.day <= to);
  const netBy = new Map<string, number>();
  for (const row of inRange) {
    netBy.set(row.channel, (netBy.get(row.channel) ?? 0) + row.net);
  }
  const available = [...netBy].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const picked = available.filter((c) => input.requested.includes(c));
  const channels = picked.length >= 2 ? picked : available.slice(0, 2);
  const allNet = [...netBy.values()].reduce((a, b) => a + b, 0);

  const table = channels.map((channel) => {
    const range = totals(inRange.filter((r) => r.channel === channel));
    const mtd = totals(
      input.days.filter(
        (r) => r.channel === channel && r.day >= monthStart(to) && r.day <= to,
      ),
    );
    return {
      channel,
      ...range,
      share: allNet === 0 ? 0 : range.net / allNet,
      discountRate: range.gross === 0 ? null : range.discount / range.gross,
      discountRateNet: range.net === 0 ? null : range.discount / range.net,
      mtdNet: mtd.net,
    };
  });

  const weekMap = new Map<string, { net: number[]; orders: number[] }>();
  for (let day = from; day <= to; day = nextDay(day)) {
    const week = startOfWeek(day);
    if (!weekMap.has(week)) {
      weekMap.set(week, {
        net: channels.map(() => 0),
        orders: channels.map(() => 0),
      });
    }
  }
  for (const row of inRange) {
    const index = channels.indexOf(row.channel);
    if (index < 0) continue;
    const week = weekMap.get(startOfWeek(row.day))!;
    week.net[index] += row.net;
    week.orders[index] += row.orders;
  }

  const locationMap = new Map<string, number[]>();
  for (const row of input.locations) {
    const index = channels.indexOf(row.channel);
    if (index < 0) continue;
    const net = locationMap.get(row.location) ?? channels.map(() => 0);
    net[index] += row.net;
    locationMap.set(row.location, net);
  }

  return {
    available,
    channels,
    table,
    weeks: [...weekMap].map(([week, value]) => ({
      week,
      net: value.net,
      atv: value.net.map((net, i) => atv(net, value.orders[i])),
    })),
    locations: [...locationMap]
      .map(([location, net]) => ({
        location,
        net,
        total: net.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total),
  };
}

export type DeliveryCampaign = {
  code: string;
  channel: string;
  name: string;
  startsAt: string;
  endsAt: string;
};

/**
 * One row per offer sold on any of `perChannel`'s channels, cells indexed like
 * `perChannel`, biggest delivery net first. Campaigns are registered
 * aggregator offers (Postgres `aggregator_offers`) matched on code + channel.
 */
export function buildOfferMatrix(
  perChannel: { channel: string; offers: OfferValue[] }[],
  campaigns: DeliveryCampaign[],
) {
  const rows = new Map<
    string,
    {
      code: string;
      name: string;
      scope: string | null;
      cells: (OfferCell | null)[];
    }
  >();
  perChannel.forEach(({ channel, offers }, index) => {
    for (const offer of offers) {
      if (offer.orders === 0) continue;
      const row = rows.get(offer.code) ?? {
        code: offer.code,
        name: offer.name,
        scope: offer.channel,
        cells: perChannel.map(() => null),
      };
      row.cells[index] = {
        offer,
        campaigns: campaigns.filter(
          (c) => c.code === offer.code && c.channel === channel,
        ),
      };
      rows.set(offer.code, row);
    }
  });

  return {
    offerNet: perChannel.map(({ offers }) =>
      offers.reduce((sum, offer) => sum + offer.offerNet, 0),
    ),
    rows: [...rows.values()]
      .map((row) => ({
        ...row,
        totalNet: row.cells.reduce(
          (sum, cell) => sum + (cell?.offer.offerNet ?? 0),
          0,
        ),
        totalOrders: row.cells.reduce(
          (sum, c) => sum + (c?.offer.orders ?? 0),
          0,
        ),
      }))
      .sort((a, b) => b.totalNet - a.totalNet),
  };
}

export type OfferCell = {
  /** The offer valued on this channel only. */
  offer: OfferValue;
  campaigns: DeliveryCampaign[];
};

/** Aggregator enum (Postgres) → POS channel name. */
export const AGGREGATOR_CHANNEL: Record<string, string> = {
  wolt: "Wolt",
  bolt: "Bolt",
  foody: "Foody",
  efood: "Efood",
};
