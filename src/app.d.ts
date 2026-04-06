// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthSessionData, AuthUser } from "$lib/server/auth";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      session: AuthSessionData | null;
      user: AuthUser | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
