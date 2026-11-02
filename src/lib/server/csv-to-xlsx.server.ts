import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeResident,
  MAX_FILE_BYTES,
  readFileWithRetry,
  runOfficeCli,
  sanitizeFilename,
  XLSX_MIME,
} from "$lib/server/mastra/tools/generate-excel";
import { getObjectStore } from "$lib/server/object-store.server";

const CREATE_TIMEOUT_MS = 15_000;
/** ~7 s per 100k rows measured with officecli 1.0.140; generous headroom. */
const IMPORT_TIMEOUT_MS = 120_000;

/**
 * Builds an .xlsx from a CSV via `officecli import` (header row frozen
 * and autofiltered) and stores it where /api/ai/files serves downloads.
 * `writeCsv` fills the CSV inside a private temp dir that is always removed.
 * Callers must already have neutralised `=`-prefixed text: import turns
 * those into live formulas.
 */
export async function exportCsvAsXlsx(
  name: string,
  writeCsv: (csvPath: string) => Promise<void>,
): Promise<{ downloadUrl: string; bytes: number }> {
  const filename = sanitizeFilename(name);
  // Short temp path: officecli on Windows fails under very long paths.
  const workDir = await mkdtemp(join(tmpdir(), "xlsx-"));
  const csvPath = join(workDir, "data.csv");
  const xlsxPath = join(workDir, "out.xlsx");

  try {
    await writeCsv(csvPath);
    await runOfficeCli(["create", xlsxPath, "--json"], CREATE_TIMEOUT_MS);
    const stdout = await runOfficeCli(
      ["import", xlsxPath, "/Sheet1", csvPath, "--header", "--json"],
      IMPORT_TIMEOUT_MS,
    ).catch((cause: { stdout?: unknown }) => {
      // Failed commands exit non-zero but still print their JSON report.
      if (typeof cause.stdout === "string" && cause.stdout.trim()) {
        return cause.stdout;
      }
      throw cause;
    });
    const report = JSON.parse(stdout) as {
      success?: boolean;
      error?: unknown;
    };
    if (report.success !== true) {
      throw new Error(
        `officecli import failed: ${JSON.stringify(report.error ?? report).slice(0, 400)}`,
      );
    }
    await closeResident(xlsxPath);

    const bytes = await readFileWithRetry(xlsxPath);
    if (bytes.length > MAX_FILE_BYTES) {
      throw new Error(`Export too large (${bytes.length} bytes)`);
    }
    const fileId = randomUUID();
    await getObjectStore().put(
      `ai-exports/${fileId}/${filename}`,
      bytes,
      XLSX_MIME,
    );

    return {
      downloadUrl: `/api/ai/files/${fileId}/${encodeURIComponent(filename)}`,
      bytes: bytes.length,
    };
  } finally {
    await closeResident(xlsxPath);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
