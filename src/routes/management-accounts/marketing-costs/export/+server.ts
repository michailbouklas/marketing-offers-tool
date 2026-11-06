import { writeFile } from "node:fs/promises";
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { hasAnyRole, managementAccountsRoles } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";
import { exportCsvAsXlsx } from "$lib/server/csv-to-xlsx.server";
import { marketingCostCsv } from "$lib/services/management-accounts";
import {
  loadMarketingCosts,
  resolveManagementAccountsScope,
} from "$lib/services/management-accounts.server";
import type { RequestHandler } from "./$types";

const bodySchema = z.object({
  company: z.string().max(200).nullable(),
  month: z.number().int().min(1).max(12).nullable().default(null),
  /** Account codes in grid order, after the grid's filters and sort. */
  codes: z.array(z.string().max(50)).min(1).max(5000),
});

/**
 * Excel of the rows the exploration grid shows. The browser sends only which
 * accounts (and in what order); the numbers are re-queried here, so the file
 * never carries client-supplied amounts.
 */
export const POST: RequestHandler = async (event) => {
  const { session } = requireAuthenticatedUser(event);
  const role = await getAuthenticatedUserRole(event);
  if (!hasAnyRole(role, managementAccountsRoles)) {
    error(403, "Forbidden");
  }
  const parsed = bodySchema.safeParse(
    await event.request.json().catch(() => null),
  );
  if (!parsed.success) error(400, "Invalid export request");

  const { company, month, table } = await loadMarketingCosts(
    parsed.data.company,
    await resolveManagementAccountsScope({ id: session.userId, role }),
    parsed.data.month === null ? null : String(parsed.data.month),
  );
  const csv = marketingCostCsv(table, parsed.data.codes);
  const monthSuffix = month ? `-m${String(month).padStart(2, "0")}` : "";
  try {
    const result = await exportCsvAsXlsx(
      `marketing-costs-${company ?? "all-companies"}${monthSuffix}`,
      (csvPath) => writeFile(csvPath, csv, "utf8"),
    );
    return json({ downloadUrl: result.downloadUrl });
  } catch (cause) {
    console.error(
      "[management-accounts] marketing costs export failed:",
      cause,
    );
    error(500, "The Excel export could not be generated");
  }
};
