/**
 * Marketing Cost block of the Power BI "Management Accounts - Overview" →
 * "Financial Performance" widget, rebuilt from SAPBW. Rules were matched
 * against the Power BI numbers; see
 * docs/management-accounts/financial-performance-model.md §10.
 */

/** One GL account × calendar year total, as returned by the server query. */
export type MarketingCostRow = {
  level4Code: string;
  level4Name: string;
  level5Code: string;
  level5Name: string;
  year: number;
  /** Credit − Debit in EUR: costs are negative, as in Power BI. */
  value: number;
};

export type MarketingCostLine = {
  code: string;
  name: string;
  /** Aligned with `MarketingCostTable.years`. */
  values: number[];
};

export type MarketingCostGroup = MarketingCostLine & {
  accounts: MarketingCostLine[];
};

export type MarketingCostTable = {
  years: number[];
  total: number[];
  groups: MarketingCostGroup[];
};

/** The four calendar years the Power BI widget shows: current year and the three before. */
export function marketingCostYears(today = new Date()): number[] {
  const year = today.getFullYear();
  return [year - 3, year - 2, year - 1, year];
}

/** `?month=` value → 1–12, or null (all months) for anything else. */
export function parseMonth(value: string | null): number | null {
  const month = Number(value);
  return value && Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : null;
}

const byName = (a: MarketingCostLine, b: MarketingCostLine) =>
  a.name.localeCompare(b.name);

/** Pivots account × year rows into Level4 groups (sorted by name) with Level5 accounts. */
export function buildMarketingCostTable(
  rows: MarketingCostRow[],
  years: number[],
): MarketingCostTable {
  const yearIndex = new Map(years.map((year, index) => [year, index]));
  const zeros = () => years.map(() => 0);
  const groups = new Map<
    string,
    MarketingCostGroup & { byAccount: Map<string, MarketingCostLine> }
  >();
  const total = zeros();

  for (const row of rows) {
    const index = yearIndex.get(row.year);
    if (index === undefined) continue;

    let group = groups.get(row.level4Code);
    if (!group) {
      group = {
        code: row.level4Code,
        name: row.level4Name,
        values: zeros(),
        accounts: [],
        byAccount: new Map(),
      };
      groups.set(row.level4Code, group);
    }

    let account = group.byAccount.get(row.level5Code);
    if (!account) {
      account = { code: row.level5Code, name: row.level5Name, values: zeros() };
      group.byAccount.set(row.level5Code, account);
    }

    account.values[index] += row.value;
    group.values[index] += row.value;
    total[index] += row.value;
  }

  return {
    years,
    total,
    groups: [...groups.values()]
      .map(({ byAccount, ...group }) => ({
        ...group,
        accounts: [...byAccount.values()].sort(byName),
      }))
      .sort(byName),
  };
}

const amountFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

/** Power BI accounting style: `(1,234)` for negatives, `-` for zero. */
export function formatAccounting(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "-";
  const text = amountFormat.format(Math.abs(rounded));
  return rounded < 0 ? `(${text})` : text;
}

/** One CSV field; text starting with `=` gets a leading space so officecli import keeps it as text. */
function csvField(value: string | number): string {
  const text = String(value);
  const safe = text.startsWith("=") ? ` ${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * CSV of the given accounts, in the given order (the exploration grid's
 * filtered + sorted view). Unknown codes are skipped. Amounts are signed EUR
 * rounded to cents: costs negative, as in the grid.
 */
export function marketingCostCsv(
  table: MarketingCostTable,
  codes: string[],
): string {
  const byCode = new Map(
    table.groups.flatMap((group) =>
      group.accounts.map((account) => [account.code, { group, account }]),
    ),
  );
  const lines = [["Group", "Account code", "Account", ...table.years]];
  for (const code of codes) {
    const hit = byCode.get(code);
    if (!hit) continue;
    lines.push([
      hit.group.name,
      hit.account.code,
      hit.account.name,
      ...hit.account.values.map((value) => Math.round(value * 100) / 100),
    ]);
  }
  return (
    lines.map((line) => line.map(csvField).join(",")).join("\r\n") + "\r\n"
  );
}
