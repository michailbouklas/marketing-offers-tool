import { auth } from "$lib/server/auth";
import { toSvelteKitHandler } from "better-auth/svelte-kit";
import type { RequestHandler } from "./$types";

const handler: RequestHandler = toSvelteKitHandler(auth);

export const GET = handler;
export const POST = handler;
