/** One row of the item-analysis query: an item, a category total, or the grand total. */
export type ItemAnalysisRow = {
  level: "item" | "category" | "grand";
  category: string;
  code: string;
  name: string;
  qty: number;
  /** Distinct orders: on category / grand rows NOT the sum of the item rows. */
  trans: number;
  net: number;
};

export type ItemAnalysisFigures = {
  qty: number;
  qtyGrp: number;
  qtyTot: number;
  /** Quantity per 100 transactions of the whole selection (POS "Qty/Tr"), a fraction. */
  qtyPerTrans: number;
  trans: number;
  transGrp: number;
  transTot: number;
  net: number;
  netGrp: number;
  netTot: number;
};

export type ItemAnalysisLine = ItemAnalysisFigures & {
  code: string;
  name: string;
};

export type ItemAnalysisGroup = {
  category: string;
  items: ItemAnalysisLine[];
  total: ItemAnalysisFigures;
};

export type ItemAnalysisReport = {
  groups: ItemAnalysisGroup[];
  grand: { qty: number; trans: number; net: number };
};

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/** Groups the rows like the POS report: categories by net (best first), items by code. */
export function buildItemAnalysis(rows: ItemAnalysisRow[]): ItemAnalysisReport {
  const grandRow = rows.find((row) => row.level === "grand");
  const grand = {
    qty: grandRow?.qty ?? 0,
    trans: grandRow?.trans ?? 0,
    net: grandRow?.net ?? 0,
  };
  const figures = (
    row: ItemAnalysisRow,
    group: ItemAnalysisRow,
  ): ItemAnalysisFigures => ({
    qty: row.qty,
    qtyGrp: ratio(row.qty, group.qty),
    qtyTot: ratio(row.qty, grand.qty),
    qtyPerTrans: ratio(row.qty, grand.trans),
    trans: row.trans,
    transGrp: ratio(row.trans, group.trans),
    transTot: ratio(row.trans, grand.trans),
    net: row.net,
    netGrp: ratio(row.net, group.net),
    netTot: ratio(row.net, grand.net),
  });

  return {
    grand,
    groups: rows
      .filter((row) => row.level === "category")
      .sort((a, b) => b.net - a.net)
      .map((group) => ({
        category: group.category,
        total: figures(group, group),
        items: rows
          .filter(
            (row) => row.level === "item" && row.category === group.category,
          )
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((row) => ({
            code: row.code,
            name: row.name,
            ...figures(row, group),
          })),
      })),
  };
}
