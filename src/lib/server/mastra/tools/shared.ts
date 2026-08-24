import { generateExcel } from "./generate-excel";
import { generateThreeJsReport } from "./generate-threejs-report";

/**
 * Tools every chat agent gets, spread into each agent's `tools` map
 * (`tools: { ...sharedTools, ... }`) — Mastra has no instance-level toolset,
 * so this barrel is the convention that keeps them universal.
 *
 * The map key doubles as the model-facing tool name AND the UI stream part
 * type (`tool-generateExcel`) — renaming a key breaks the matching branches
 * in chat-widget.svelte and admin/chat-conversation-dialog.svelte.
 */
export const sharedTools = { generateExcel, generateThreeJsReport };
