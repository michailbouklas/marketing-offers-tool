import { createAuthClient } from "better-auth/svelte";
import { adminClient } from "better-auth/client/plugins";
import { ac, roles } from "$lib/auth/permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles })],
});

export const { signIn, signOut, useSession } = authClient;
