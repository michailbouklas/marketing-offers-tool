import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    api_WOLT_header: {
      aggregate: vi.fn(),
    },
    api_WOLT_lines: {
      groupBy: vi.fn(),
    },
    api_BOLT_header: {
      aggregate: vi.fn(),
    },
    api_BOLT_lines: {
      groupBy: vi.fn(),
    },
  },
}));

const prismaModule = await import("$lib/server/prisma");
const { getStoreInvoiceMetrics } = await import("./invoices.server");

const prismaMock = prismaModule.prisma as unknown as {
  api_WOLT_header: { aggregate: ReturnType<typeof vi.fn> };
  api_WOLT_lines: { groupBy: ReturnType<typeof vi.fn> };
  api_BOLT_header: { aggregate: ReturnType<typeof vi.fn> };
  api_BOLT_lines: { groupBy: ReturnType<typeof vi.fn> };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("getStoreInvoiceMetrics", () => {
  it("returns Wolt period totals and transaction type metrics", async () => {
    prismaMock.api_WOLT_header.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { totalpayout: "31.50" },
    });
    prismaMock.api_WOLT_lines.groupBy
      .mockResolvedValueOnce([
        {
          transtype: "Commission",
          _count: { _all: 3 },
          _sum: { totalamount: "-6.50" },
        },
        {
          transtype: "Sales",
          _count: { _all: 4 },
          _sum: { totalamount: "38.00" },
        },
      ])
      .mockResolvedValueOnce([
        {
          linedetails: "Delivery sales",
          _count: { _all: 4 },
          _sum: { totalamount: "38.00" },
        },
        {
          linedetails: "Platform commission",
          _count: { _all: 3 },
          _sum: { totalamount: "-6.50" },
        },
      ]);

    const result = await getStoreInvoiceMetrics({
      aggregator: "wolt",
      storeName: "Central Store",
      bpname: "Central BP",
      from: "2026-07-01",
      to: "2026-07-15",
    });

    expect(prismaMock.api_WOLT_header.aggregate).toHaveBeenCalledWith({
      where: {
        partnername: "Central Store",
        documentdate: {
          gte: new Date("2026-07-01T00:00:00Z"),
          lt: new Date("2026-07-16T00:00:00Z"),
        },
      },
      _count: { _all: true },
      _sum: { totalpayout: true },
    });
    expect(result).toEqual({
      invoiceCount: 2,
      lineItemCount: 7,
      totalInvoiceAmount: 31.5,
      transactionTypes: [
        {
          transactionType: "Commission",
          lineItemCount: 3,
          totalAmount: -6.5,
        },
        {
          transactionType: "Sales",
          lineItemCount: 4,
          totalAmount: 38,
        },
      ],
      lineDetails: [
        {
          lineDetails: "Delivery sales",
          lineItemCount: 4,
          totalAmount: 38,
        },
        {
          lineDetails: "Platform commission",
          lineItemCount: 3,
          totalAmount: -6.5,
        },
      ],
    });
  });

  it("uses the BP fallback only when the aggregator store name is absent", async () => {
    prismaMock.api_BOLT_header.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _sum: { totalpayout: null },
    });
    prismaMock.api_BOLT_lines.groupBy.mockResolvedValue([]);

    const result = await getStoreInvoiceMetrics({
      aggregator: "bolt",
      storeName: null,
      bpname: "Fallback BP",
      from: null,
      to: null,
    });

    expect(prismaMock.api_BOLT_header.aggregate).toHaveBeenCalledWith({
      where: { bolt_storename: null, bpname: "Fallback BP" },
      _count: { _all: true },
      _sum: { totalpayout: true },
    });
    expect(result).toEqual({
      invoiceCount: 1,
      lineItemCount: 0,
      totalInvoiceAmount: 0,
      transactionTypes: [],
      lineDetails: [],
    });
  });
});
