import { auth } from "$lib/server/auth";
import { canAccessAdminSection } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  isAdminPath,
  isApiPath,
  isPublicPath,
} from "$lib/server/auth-guards";
import { installForecastGateway } from "$lib/server/forecast-gateway.server";
import { installGoogleAnalyticsGateway } from "$lib/server/google-analytics-gateway.server";
import { startScheduler } from "$lib/server/scheduler.server";
import { resyncUserSkills } from "$lib/services/skills/user-skills-sync.server";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

// Bootstrap the offer-notification digest cron once, at server start. No-op
// during build and when the digest transport is not configured.
startScheduler();

// Gives the Forecasts Assistant's Mastra tools access to the Sales Forecasts
// services (they cannot import them directly — see forecast-gateway.server.ts).
installForecastGateway();

// Same seam for the Google Analytics Assistant: its tools reach the GA4 Data
// API (and the per-property encrypted keys) only through this gateway.
installGoogleAnalyticsGateway();

// Admin-authored agent skills live in the database and are projected to
// workspace/user-skills/<agentId>/ (gitignored) before the first request so
// a fresh worktree or container serves them. A failure is logged inside
// resyncUserSkills and must not stop the server: built-in skills still load.
export const init: ServerInit = async () => {
  if (building) return;
  await resyncUserSkills();
};

const sessionHandle: Handle = async ({ event, resolve }) => {
  let sessionData;
  try {
    sessionData = await auth.api.getSession({
      headers: event.request.headers,
    });
  } catch {
    sessionData = null;
  }

  event.locals.session = sessionData?.session ?? null;
  event.locals.user = sessionData?.user ?? null;

  const { pathname } = event.url;

  if (
    !event.locals.session &&
    !isPublicPath(pathname) &&
    !isApiPath(pathname)
  ) {
    redirect(302, "/login");
  }

  if (
    event.locals.session &&
    isAdminPath(pathname) &&
    !canAccessAdminSection(await getAuthenticatedUserRole(event))
  ) {
    redirect(302, "/");
  }

  return resolve(event);
};

const authHandle: Handle = ({ event, resolve }) =>
  svelteKitHandler({ auth, event, resolve, building });

export const handle = sequence(sessionHandle, authHandle);
