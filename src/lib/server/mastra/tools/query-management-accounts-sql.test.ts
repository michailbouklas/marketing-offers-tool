import { describe, expect, it } from "vitest";
import {
  scopeTsql,
  validateReadOnlyTsql,
} from "./query-management-accounts-sql";

describe("validateReadOnlyTsql", () => {
  it("accepts a single SELECT or WITH statement and strips a trailing semicolon", () => {
    expect(
      validateReadOnlyTsql("SELECT TOP 5 GLAccount FROM dbo.sapbw_gl;"),
    ).toEqual({
      ok: true,
      sql: "SELECT TOP 5 GLAccount FROM dbo.sapbw_gl",
    });
    expect(
      validateReadOnlyTsql("WITH c AS (SELECT 1 AS x) SELECT x FROM c").ok,
    ).toBe(true);
  });

  it.each([
    "DELETE FROM dbo.sapbw_gl",
    "SELECT 1; DROP TABLE dbo.sapbw_gl",
    "SELECT * INTO #t FROM dbo.sapbw_coa",
    "SELECT 1 -- hidden",
    "SELECT 1 /* x */",
    "WITH c AS (SELECT 1 AS x) UPDATE dbo.sapbw_gl SET Debit = 0",
    "SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'SELECT 1')",
    "EXEC sp_who",
    "",
  ])("rejects %j", (query) => {
    expect(validateReadOnlyTsql(query).ok).toBe(false);
  });
});

describe("scopeTsql", () => {
  const known = new Set([
    "sapbw_gl",
    "sapbw_coa",
    "sapbw_budgets",
    "sapbw_items",
    "vw_wolt_bp",
  ]);
  const scope = {
    all: false,
    companies: [
      { databaseId: "WOWBURGERSDB", companyName: "WOW BURGERS LTD" },
      {
        databaseId: "PHC_EUR",
        companyName: "PHC FRANCHISED RESTAURANTS PUBLIC LTD",
      },
    ],
  };
  const prefix =
    "WITH scoped_gl AS (SELECT * FROM dbo.sapbw_gl WHERE databaseId IN (@ma_db0, @ma_db1)), " +
    "scoped_budgets AS (SELECT * FROM dbo.sapbw_budgets WHERE databaseId IN (@ma_db0, @ma_db1))";

  const ok = (query: string) => {
    const result = scopeTsql(query, scope, known);
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  it("swaps the GL for the scoped CTE and binds the user's databaseIds", () => {
    const result = ok(
      "SELECT SUM(g.Credit - g.Debit) FROM dbo.sapbw_gl g JOIN dbo.sapbw_coa c ON c.Level5Code = g.GLAccount",
    );
    expect(result.sql).toBe(
      `${prefix} SELECT SUM(g.Credit - g.Debit) FROM scoped_gl g JOIN dbo.sapbw_coa c ON c.Level5Code = g.GLAccount`,
    );
    expect(result.databaseIds).toEqual(["WOWBURGERSDB", "PHC_EUR"]);
  });

  it.each([
    ["SELECT 1 FROM [dbo].[sapbw_gl]", "FROM scoped_gl"],
    ["SELECT 1 FROM sapbw_gl", "FROM scoped_gl"],
    ["SELECT 1 FROM DBO.SAPBW_GL AS g", "FROM scoped_gl AS g"],
    [
      "SELECT sapbw_gl.Credit FROM dbo.sapbw_gl",
      "SELECT scoped_gl.Credit FROM scoped_gl",
    ],
    ["SELECT 1 FROM dbo.sapbw_budgets b", "FROM scoped_budgets b"],
    [`SELECT 1 FROM "sapbw_gl"`, `FROM "scoped_gl"`],
  ])("rewrites %j", (query, expected) => {
    expect(ok(query).sql).toContain(expected);
    expect(ok(query).sql.replace(prefix, "")).not.toMatch(
      /sapbw_gl|sapbw_budgets/i,
    );
  });

  it("merges into the agent's own WITH", () => {
    expect(
      ok("WITH t AS (SELECT * FROM dbo.sapbw_gl) SELECT COUNT(*) FROM t").sql,
    ).toBe(`${prefix}, t AS (SELECT * FROM scoped_gl) SELECT COUNT(*) FROM t`);
  });

  it("leaves string literals alone", () => {
    expect(
      ok("SELECT 'dbo.sapbw_gl' AS label FROM dbo.sapbw_gl").sql,
    ).toContain("SELECT 'dbo.sapbw_gl' AS label FROM scoped_gl");
  });

  it.each([
    "SELECT * FROM dbo.sapbw_items",
    "SELECT * FROM dbo.vw_WOLT_BP",
    "SELECT name FROM sys.objects",
    "SELECT * FROM INFORMATION_SCHEMA.TABLES",
    "SELECT * FROM SAPBW.dbo.sapbw_gl",
    "SELECT * FROM SAPBW..sapbw_gl",
    "SELECT * FROM dbo.sapbw_gl_backup",
  ])("rejects %j", (query) => {
    expect(scopeTsql(query, scope, known).ok).toBe(false);
  });

  it("refuses an empty scope and passes admins through unchanged", () => {
    expect(
      scopeTsql(
        "SELECT 1 FROM dbo.sapbw_gl",
        { all: false, companies: [] },
        known,
      ).ok,
    ).toBe(false);
    expect(
      scopeTsql(
        "SELECT 1 FROM dbo.sapbw_gl",
        { all: true, companies: [] },
        known,
      ),
    ).toEqual({ ok: true, sql: "SELECT 1 FROM dbo.sapbw_gl", databaseIds: [] });
  });
});
