import { redirect } from "@sveltejs/kit";
import { hasAnyRole, managementAccountsRoles } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  requireAuthenticatedUser,
} from "$lib/server/auth-guards";
import {
  loadMarketingCosts,
  resolveManagementAccountsScope,
} from "$lib/services/management-accounts.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { session } = requireAuthenticatedUser(event);
  const role = await getAuthenticatedUserRole(event);
  if (!hasAnyRole(role, managementAccountsRoles)) {
    redirect(302, "/");
  }

  const scope = await resolveManagementAccountsScope({
    id: session.userId,
    role,
  });
  return loadMarketingCosts(
    event.url.searchParams.get("company"),
    scope,
    event.url.searchParams.get("month"),
  );
};
