import { auth } from "$lib/server/auth";
import { isAdminRole } from "$lib/auth/roles";
import {
  getAuthenticatedUserRole,
  isAdminPath,
  isPublicPath,
} from "$lib/server/auth-guards";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { redirect, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

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

  if (!event.locals.session && !isPublicPath(pathname)) {
    redirect(302, "/login");
  }

  if (
    event.locals.session &&
    isAdminPath(pathname) &&
    !isAdminRole(await getAuthenticatedUserRole(event))
  ) {
    redirect(302, "/");
  }

  return resolve(event);
};

const authHandle: Handle = ({ event, resolve }) =>
  svelteKitHandler({ auth, event, resolve, building });

export const handle = sequence(sessionHandle, authHandle);
