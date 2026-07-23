import { createTool } from "@mastra/core/tools";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getOfficeCliPath } from "../env";
import { getObjectStore } from "../object-store";

const execFileAsync = promisify(execFile);

const MAX_SHEETS = 5;
const MAX_COLUMNS = 50;
const MAX_ROWS_PER_SHEET = 5_000;
const MAX_TOTAL_CELLS = 20_000;
const MAX_EXTRA_COMMANDS = 200;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const CREATE_TIMEOUT_MS = 15_000;
const BATCH_TIMEOUT_MS = 60_000;

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Batch commands the agent may pass through via extraCommands. Everything
 * else (dump, proofread, shell-ish escape hatches in future CLI versions) is
 * rejected up front.
 */
const ALLOWED_BATCH_COMMANDS = new Set([
  "set",
  "add",
  "remove",
  "move",
  "swap",
  "merge",
]);

export type GenerateExcelResult =
  | {
      ok: true;
      fileId: string;
      filename: string;
      downloadUrl: string;
      rowCount: number;
      sheetCount: number;
    }
  | { ok: false; error: string };

interface BatchCommand {
  command: string;
  path: string;
  type?: string;
  props?: Record<string, unknown>;
}

/** 0-based column index -> A1 column letters (0 -> A, 26 -> AA). */
function columnRef(index: number): string {
  let ref = "";
  let n = index;
  do {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return ref;
}

/** Restrict to download-header-safe characters and force the .xlsx suffix. */
function sanitizeFilename(raw: string): string {
  const base = raw
    .replace(/\.xlsx$/i, "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 96)
    .trim();
  return `${base || "export"}.xlsx`;
}

/** Excel sheet-name rules: no []:*?/\ and at most 31 characters. */
function sanitizeSheetName(
  raw: string,
  index: number,
  used: Set<string>,
): string {
  let name =
    raw
      .replace(/[[\]:*?/\\]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || `Sheet${index + 1}`;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${index + 1})`;
    name = name.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/**
 * Data cells are always literal values. officecli auto-converts values with
 * a leading "=" into live formulas (verified on 1.0.73), so string data that
 * starts with "=" gets a leading space — it stays a plain string and the
 * space is invisible in Excel. Formulas are only possible via extraCommands.
 */
function toLiteralCellValue(cell: string | number | boolean): string {
  if (typeof cell === "boolean") {
    return cell ? "TRUE" : "FALSE";
  }
  if (typeof cell === "number") {
    return String(cell);
  }
  return cell.startsWith("=") ? ` ${cell}` : cell;
}

function vetExtraCommands(
  extraCommands: Record<string, unknown>[],
): { ok: true; commands: BatchCommand[] } | { ok: false; error: string } {
  const commands: BatchCommand[] = [];
  for (const item of extraCommands) {
    const command = item.command;
    const path = item.path;
    if (typeof command !== "string" || !ALLOWED_BATCH_COMMANDS.has(command)) {
      return {
        ok: false,
        error: `Unsupported extraCommands command ${JSON.stringify(command)} — allowed: ${[...ALLOWED_BATCH_COMMANDS].join(", ")}.`,
      };
    }
    if (typeof path !== "string" || !path.startsWith("/")) {
      return {
        ok: false,
        error: `Every extraCommands item needs a "path" starting with "/" (got ${JSON.stringify(path)}).`,
      };
    }
    commands.push({
      command,
      path,
      ...(typeof item.type === "string" ? { type: item.type } : {}),
      ...(item.props && typeof item.props === "object"
        ? { props: item.props as Record<string, unknown> }
        : {}),
    });
  }
  return { ok: true, commands };
}

interface OfficeCliBatchOutput {
  success?: boolean;
  data?: {
    results?: {
      index: number;
      success: boolean;
      output?: string;
      error?: string;
      /** The batch item that failed (echoed back by officecli ≥1.0.140). */
      item?: Record<string, unknown>;
    }[];
    summary?: { total: number; failed: number; atomicRolledBack?: boolean };
  };
}

/**
 * Windows antivirus briefly locks freshly written files (EBUSY/EPERM), so a
 * read right after officecli exits can fail; retry with a short backoff.
 */
async function readFileWithRetry(path: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await readFile(path);
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") {
        throw cause;
      }
      lastError = cause;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function runOfficeCli(
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const { stdout } = await execFileAsync(getOfficeCliPath(), args, {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      // The tool never pipes stdin; silence the CLI's redirected-stdin warning.
      OFFICECLI_BATCH_ALLOW_STDIN_REDIRECT: "1",
    },
  });
  return stdout;
}

/**
 * officecli keeps a resident process holding the document open for faster
 * follow-up commands; it must be closed to release the file lock before we
 * can read or delete the xlsx. Idempotent and best-effort.
 */
async function closeResident(xlsxPath: string): Promise<void> {
  await runOfficeCli(["close", xlsxPath, "--json"], CREATE_TIMEOUT_MS).catch(
    () => {},
  );
}

interface SheetInput {
  name: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

export async function generateExcelFile(input: {
  filename: string;
  sheets: SheetInput[];
  extraCommands?: Record<string, unknown>[];
}): Promise<GenerateExcelResult> {
  const totalCells = input.sheets.reduce(
    (sum, sheet) => sum + sheet.columns.length * (sheet.rows.length + 1),
    0,
  );
  if (totalCells > MAX_TOTAL_CELLS) {
    return {
      ok: false,
      error: `Too much data (${totalCells} cells > ${MAX_TOTAL_CELLS}). Narrow the export (fewer rows/columns) or aggregate first.`,
    };
  }
  for (const sheet of input.sheets) {
    if (sheet.rows.length > MAX_ROWS_PER_SHEET) {
      return {
        ok: false,
        error: `Sheet "${sheet.name}" has ${sheet.rows.length} rows (max ${MAX_ROWS_PER_SHEET}).`,
      };
    }
  }

  const vetted = vetExtraCommands(input.extraCommands ?? []);
  if (!vetted.ok) {
    return vetted;
  }

  const filename = sanitizeFilename(input.filename);
  const usedSheetNames = new Set<string>();
  const commands: BatchCommand[] = [];
  let rowCount = 0;

  input.sheets.forEach((sheet, sheetIndex) => {
    const name = sanitizeSheetName(sheet.name, sheetIndex, usedSheetNames);
    if (sheetIndex === 0) {
      // `officecli create` starts with a single sheet named Sheet1.
      if (name !== "Sheet1") {
        commands.push({ command: "set", path: "/Sheet1", props: { name } });
      }
    } else {
      commands.push({
        command: "add",
        path: "/",
        type: "sheet",
        props: { name },
      });
    }

    sheet.columns.forEach((column, colIndex) => {
      commands.push({
        command: "set",
        path: `/${name}/${columnRef(colIndex)}1`,
        props: { value: toLiteralCellValue(column), bold: "true" },
      });
    });

    sheet.rows.forEach((row, rowIndex) => {
      rowCount += 1;
      row.slice(0, sheet.columns.length).forEach((cell, colIndex) => {
        if (cell === null || cell === "") {
          return;
        }
        commands.push({
          command: "set",
          path: `/${name}/${columnRef(colIndex)}${rowIndex + 2}`,
          props: { value: toLiteralCellValue(cell) },
        });
      });
    });
  });

  commands.push(...vetted.commands);

  const startedAt = Date.now();
  const workDir = await mkdtemp(join(tmpdir(), "ai-excel-"));

  try {
    const xlsxPath = join(workDir, "out.xlsx");
    const batchPath = join(workDir, "batch.json");

    await runOfficeCli(["create", xlsxPath, "--json"], CREATE_TIMEOUT_MS);
    await writeFile(batchPath, JSON.stringify(commands), "utf8");

    const stdout = await runOfficeCli(
      ["batch", xlsxPath, "--input", batchPath, "--json", "--stop-on-error"],
      BATCH_TIMEOUT_MS,
    ).catch((cause) => {
      // A failed batch exits non-zero (rejecting execFile) but still prints
      // its per-command JSON report on stdout — recover it so the failing
      // command is reported instead of Node's generic "Command failed".
      const execError = cause as { stdout?: unknown };
      if (typeof execError.stdout === "string" && execError.stdout.trim()) {
        return execError.stdout;
      }
      throw cause;
    });
    await closeResident(xlsxPath);

    let parsed: OfficeCliBatchOutput;
    try {
      parsed = JSON.parse(stdout) as OfficeCliBatchOutput;
    } catch {
      return {
        ok: false,
        error: `officecli returned unparseable output: ${stdout.slice(0, 400)}`,
      };
    }
    const failed = parsed.data?.results?.find((result) => !result.success);
    if (
      parsed.success === false ||
      (parsed.data?.summary?.failed ?? 0) > 0 ||
      failed
    ) {
      const failedItem = failed?.item
        ? ` — failing command: ${JSON.stringify(failed.item).slice(0, 300)}`
        : "";
      const rolledBack = parsed.data?.summary?.atomicRolledBack
        ? " The batch was rolled back — no changes were written; fix the failing command and retry the full export."
        : "";
      return {
        ok: false,
        error: `officecli batch failed: ${failed?.error ?? failed?.output ?? "unknown error"}${failedItem}.${rolledBack}`,
      };
    }

    const bytes = await readFileWithRetry(xlsxPath);
    if (bytes.length > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `Generated file is too large (${bytes.length} bytes > ${MAX_FILE_BYTES}).`,
      };
    }

    const fileId = randomUUID();
    await getObjectStore().put(
      `ai-exports/${fileId}/${filename}`,
      bytes,
      XLSX_MIME,
    );

    console.log(
      `[generate-excel] ${filename}: ${rowCount} row(s), ${input.sheets.length} sheet(s), ${bytes.length} bytes in ${Date.now() - startedAt}ms`,
    );

    return {
      ok: true,
      fileId,
      filename,
      downloadUrl: `/api/ai/files/${fileId}/${encodeURIComponent(filename)}`,
      rowCount,
      sheetCount: input.sheets.length,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(
      `[generate-excel] failed in ${Date.now() - startedAt}ms: ${message}`,
    );
    return { ok: false, error: `Excel generation failed: ${message}` };
  } finally {
    // Release the resident lock even when create/batch threw, then clean up.
    // Cleanup is best-effort — antivirus can briefly lock fresh files.
    await closeResident(join(workDir, "out.xlsx"));
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const generateExcel = createTool({
  id: "generate-excel",
  description:
    "Generate a downloadable Excel (.xlsx) file from tabular data already available in the conversation " +
    "(e.g. results of a previous query). Returns a download URL that the chat UI renders as a download " +
    "button — never invent or alter that URL. Headers are written bold automatically. For extra " +
    "formatting, formulas, or charts pass officecli batch items via extraCommands — load the " +
    '"excel-generation" skill first for the command reference.',
  inputSchema: z.object({
    filename: z
      .string()
      .describe(
        'Descriptive filename, e.g. "wolt-payouts-june-2026.xlsx". Letters, digits, spaces, ._()- only.',
      ),
    sheets: z
      .array(
        z.object({
          name: z.string().describe("Sheet tab name (max 31 chars)."),
          columns: z
            .array(z.string())
            .min(1)
            .max(MAX_COLUMNS)
            .describe("Header labels; written bold on row 1."),
          rows: z
            .array(z.array(cellValue))
            .describe(
              "Data rows, each aligned with columns. Cells are written as literal values, never formulas.",
            ),
        }),
      )
      .min(1)
      .max(MAX_SHEETS),
    extraCommands: z
      .array(z.record(z.string(), z.unknown()))
      .max(MAX_EXTRA_COMMANDS)
      .optional()
      .describe(
        "Optional officecli batch items applied after the data is written (formatting, formulas, charts, " +
          'freeze panes...). Item shape: {"command":"set|add|remove|move|swap|merge","path":"/Sheet/A1",' +
          '"type"?:...,"props"?:{...}}. Load the "excel-generation" skill for the property reference.',
      ),
  }),
  execute: async ({ filename, sheets, extraCommands }) => {
    return generateExcelFile({ filename, sheets, extraCommands });
  },
});
