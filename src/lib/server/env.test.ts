import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));

const { parseEnvFileContents } = await import("./env");

describe("parseEnvFileContents", () => {
  it("parses plain, quoted and single-quoted values", () => {
    expect(
      parseEnvFileContents(
        ["A=plain", 'B="double quoted"', "C='single quoted'"].join("\n"),
      ),
    ).toEqual({ A: "plain", B: "double quoted", C: "single quoted" });
  });

  it("strips inline comments after quoted values (the .env.example style)", () => {
    const contents = [
      'FORECAST_SERVICE_URL="http://localhost:8000"   # compose sets http://forecast:8000',
      'CLICKHOUSE_SALES_DATABASE="default"            # already read by the sales agent',
      'FORECAST_TIMEOUT_MS="75000"                    # keep > FORECAST_TIMEOUT_S*1000',
    ].join("\r\n");

    expect(parseEnvFileContents(contents)).toEqual({
      FORECAST_SERVICE_URL: "http://localhost:8000",
      CLICKHOUSE_SALES_DATABASE: "default",
      FORECAST_TIMEOUT_MS: "75000",
    });
  });

  it("strips inline comments after unquoted values but keeps # inside quotes", () => {
    expect(
      parseEnvFileContents(
        ["A=value # comment", 'B="value # not a comment"', "C=no#comment"].join(
          "\n",
        ),
      ),
    ).toEqual({ A: "value", B: "value # not a comment", C: "no#comment" });
  });

  it("skips blank lines, comment lines and lines without a key", () => {
    expect(
      parseEnvFileContents(
        ["", "# heading", "=orphan", "KEY=", "export X=1"].join("\n"),
      ),
    ).toEqual({ KEY: "", X: "1" });
  });
});
