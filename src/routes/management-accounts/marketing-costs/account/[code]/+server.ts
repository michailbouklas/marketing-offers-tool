import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import { hasAnyRole, managementAccountsRoles } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";
import {
  marketingCostYears,
  parseMonth,
} from "$lib/services/management-accounts";
import {
  getMarketingAccountDetail,
  resolveCompanySelection,
  resolveManagementAccountsScope,
} from "$lib/services/management-accounts.server";
import type { RequestHandler } from "./$types";

const codeSchema = z.string().regex(/^\d{6,15}$/);

/**
 * Drill-down for one marketing GL account, within the user's company scope.
 * `?year=` (one of the table's years), `?company=` and `?month=` as on the page.
 */
export const GET: RequestHandler = async (event) => {
  const { session } = requireAuthenticatedUser(event);
  const role = await getAuthenticatedUserRole(event);
  if (!hasAnyRole(role, managementAccountsRoles)) error(403, "Forbidden");

  const code = codeSchema.safeParse(event.params.code);
  const years = marketingCostYears();
  const year = Number(event.url.searchParams.get("year"));
  if (!code.success || !years.includes(year)) error(400, "Invalid request");

  const scope = await resolveManagementAccountsScope({
    id: session.userId,
    role,
  });
  const { databaseIds } = resolveCompanySelection(
    event.url.searchParams.get("company"),
    scope,
  );
  const detail = await getMarketingAccountDetail({
    code: code.data,
    year,
    years,
    databaseIds,
    month: parseMonth(event.url.searchParams.get("month")),
  });
  if (!detail) error(404, "Not a marketing account");
  return json(detail);
};
