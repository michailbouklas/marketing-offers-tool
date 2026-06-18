import { auth } from "$lib/server/auth";
import { canAccessAdminSection } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  isAdminPath,
  isApiPath,
  isPublicPath,
} from "$lib/server/auth-guards";
import { startScheduler } from "$lib/server/scheduler.server";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { redirect, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

// Bootstrap the offer-notification digest cron once, at server start. No-op
// during build and when the digest transport is not configured.
startScheduler();

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
