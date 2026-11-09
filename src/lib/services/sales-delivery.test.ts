import { describe, expect, it } from "vitest";
import {
  buildChannelVs,
  buildDeliveryDashboard,
  buildOfferMatrix,
  resolveDeliveryChannel,
} from "./sales-delivery";
import type { OfferValue } from "./sales-offers";

const row = (day: string, channel: string, net: number, orders: number) => ({
  day,
  channel,
  net,
  gross: net + 10,
  discount: 10,
  orders,
});

describe("resolveDeliveryChannel", () => {
  it("accepts only known delivery channels", () => {
    expect(resolveDeliveryChannel("Wolt")).toBe("Wolt");
    expect(resolveDeliveryChannel("Walk In")).toBeNull();
    expect(resolveDeliveryChannel(null)).toBeNull();
  });
});

describe("buildDeliveryDashboard", () => {
  const days = [
    row("2026-10-30", "Wolt", 100, 4), // before range, inside no MTD
    row("2026-11-01", "Wolt", 200, 10), // before range, inside MTD
    row("2026-11-02", "Wolt", 300, 10),
    row("2026-11-02", "Foody", 100, 5),
    row("2026-11-03", "Foody", 0, 0),
  ];
  const locations = [
    { location: "A", channel: "Wolt", net: 300, orders: 10 },
    { location: "B", channel: "Foody", net: 100, orders: 5 },
  ];
  const base = { days, locations, from: "2026-11-02", to: "2026-11-03" };

  it("totals the range, cuts MTD at the month start, fills empty days", () => {
    const d = buildDeliveryDashboard({ ...base, channel: null });
    expect(d.range).toEqual({
      net: 400,
      gross: 430,
      discount: 30,
      orders: 15,
      atv: 400 / 15,
    });
    expect(d.mtd.net).toBe(600);
    expect(d.daily.map((x) => x.day)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(d.daily[1].atv).toBeNull();
    expect(d.monthly).toEqual([{ month: "2026-11-01", net: 400, orders: 15 }]);
    expect(d.channels.map((c) => [c.channel, c.share])).toEqual([
      ["Wolt", 0.75],
      ["Foody", 0.25],
    ]);
    expect(d.locations[0]).toMatchObject({ location: "A", share: 0.75 });
  });

  it("filters every widget but the channel list by the selected channel", () => {
    const d = buildDeliveryDashboard({ ...base, channel: "Foody" });
    expect(d.range.net).toBe(100);
    expect(d.mtd.net).toBe(100);
    expect(d.locations).toHaveLength(1);
    expect(d.channels).toHaveLength(2);
  });
});

describe("buildChannelVs", () => {
  const days = [
    row("2026-11-01", "Wolt", 200, 10), // Sunday, week of 10-26; before range
    row("2026-11-02", "Wolt", 300, 10), // Monday
    row("2026-11-03", "Foody", 100, 5),
    row("2026-11-03", "Bolt", 50, 5),
  ];
  const locations = [
    { location: "A", channel: "Wolt", net: 300, orders: 10 },
    { location: "A", channel: "Foody", net: 100, orders: 5 },
    { location: "B", channel: "Bolt", net: 50, orders: 5 },
  ];
  const base = { days, locations, from: "2026-11-02", to: "2026-11-03" };

  it("falls back to the top two channels when fewer than two are valid", () => {
    const vs = buildChannelVs({ ...base, requested: ["Wolt", "Nope"] });
    expect(vs.available).toEqual(["Wolt", "Foody", "Bolt"]);
    expect(vs.channels).toEqual(["Wolt", "Foody"]);
  });

  it("compares the picked channels by range, MTD, week and location", () => {
    const vs = buildChannelVs({ ...base, requested: ["Bolt", "Wolt"] });
    expect(vs.channels).toEqual(["Wolt", "Bolt"]); // ordered by net
    expect(vs.table[0]).toMatchObject({
      net: 300,
      mtdNet: 500,
      share: 300 / 450,
    });
    expect(vs.table[1].discountRate).toBeCloseTo(10 / 60);
    expect(vs.table[1].discountRateNet).toBeCloseTo(10 / 50);
    expect(vs.weeks).toEqual([
      { week: "2026-11-02", net: [300, 50], atv: [30, 10] },
    ]);
    expect(vs.locations).toEqual([
      { location: "A", net: [300, 0], total: 300 },
      { location: "B", net: [0, 50], total: 50 },
    ]);
  });
});

describe("buildOfferMatrix", () => {
  const offer = (code: string, net: number, orders: number) =>
    ({
      code,
      name: code,
      channel: "Wolt Only",
      offerNet: net,
      orders,
      marginPct: 0.2,
      verdict: "positive",
    }) as OfferValue;
  const campaign = {
    code: "X",
    channel: "Foody",
    name: "Promo",
    startsAt: "2026-03-01",
    endsAt: "2026-04-01",
  };

  it("lines offers up per channel, drops unsold, tags campaigns", () => {
    const matrix = buildOfferMatrix(
      [
        { channel: "Wolt", offers: [offer("X", 100, 4), offer("Z", 0, 0)] },
        { channel: "Foody", offers: [offer("X", 50, 2), offer("Y", 400, 9)] },
      ],
      [campaign],
    );
    expect(matrix.offerNet).toEqual([100, 450]);
    expect(matrix.rows.map((r) => [r.code, r.totalNet])).toEqual([
      ["Y", 400],
      ["X", 150],
    ]);
    expect(matrix.rows[0].cells[0]).toBeNull();
    expect(matrix.rows[1].cells[0]?.campaigns).toEqual([]);
    expect(matrix.rows[1].cells[1]?.campaigns).toEqual([campaign]);
  });
});
