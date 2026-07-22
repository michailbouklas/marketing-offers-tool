import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
  getStorageEnv: vi.fn(() => ({})),
}));

const envModule = await import("$lib/server/env");
const { GET } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;

const FILE_ID = "0acff5d6-2ebd-4400-8227-13648e238341";
const FILENAME = "wolt payouts.xlsx";
const XLSX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "ai-files-"));
  mkdirSync(join(workdir, "ai-exports", FILE_ID), { recursive: true });
  writeFileSync(join(workdir, "ai-exports", FILE_ID, FILENAME), XLSX_BYTES);
  mockEnv.mockReturnValue({ UPLOADS_DIR: workdir });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function buildEvent(
  id: string,
  filename: string,
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  const url = `http://localhost/api/ai/files/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
  return {
    locals: {
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "x@example.com", role: "user" },
      ...overrides,
    },
    url: new URL(url),
    params: { id, filename },
    request: new Request(url),
  } as unknown as RequestEvent;
}

describe("GET /api/ai/files/[id]/[filename]", () => {
  it("returns 401 when unauth", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent(FILE_ID, FILENAME, { session: null, user: null }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-UUID id", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("not-a-uuid", FILENAME),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
  });

  it("returns 400 for filenames with traversal or wrong extension", async () => {
    for (const bad of ["..%2fsecret.xlsx", "notes.txt", "a/b.xlsx", ".xlsx"]) {
      const response = await (GET as (e: RequestEvent) => Promise<Response>)(
        buildEvent(FILE_ID, bad),
      ).catch((thrown: Response) => thrown);

      expect(response.status, `filename ${bad}`).toBe(400);
    }
  });

  it("returns 404 when the object is missing from the store", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("11111111-2222-3333-4444-555555555555", FILENAME),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(404);
  });

  it("streams the xlsx with attachment disposition when authorized", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent(FILE_ID, FILENAME),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_MIME);
    expect(response.headers.get("content-length")).toBe(
      String(XLSX_BYTES.length),
    );
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${FILENAME}"`,
    );
    const buf = Buffer.from(await response.arrayBuffer());
    expect(buf.equals(XLSX_BYTES)).toBe(true);
  });
});
