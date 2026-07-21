import { getMastra } from "..";

/**
 * Entry point for the `mastra dev` playground ONLY (bun run mastra:dev —
 * note the CLI's --dir points here, not at the parent). It eagerly builds
 * the Mastra instance, which requires DATABASE_URL etc.; the SvelteKit app
 * must never import this file — it resolves everything lazily through
 * getMastra() at request time so `vite build` works without env.
 */
export const mastra = getMastra();
