/**
 * The chat assistants an admin-authored skill can be assigned to. Browser-safe
 * (the skill editor's zod schema and the picker use it) — the server-only
 * allowlist in `$lib/server/mastra/chat-registry.ts` cannot be imported by
 * client code, so `assistants.test.ts` asserts the two lists stay identical.
 *
 * `id` is the Mastra agent id (also the folder name under
 * `workspace/user-skills/`); `label` mirrors the agent's `name`.
 */
export const ASSISTANTS = [
  { id: "invoices-agent", label: "Invoices Assistant" },
  { id: "google-reviews-agent", label: "Google Reviews Assistant" },
  { id: "competition-agent", label: "Competition Assistant" },
  { id: "offers-data-quality-agent", label: "Data Quality Assistant" },
  { id: "sales-agent", label: "Sales Assistant" },
  { id: "forecasts-agent", label: "Forecast Assistant" },
  { id: "google-analytics-agent", label: "Google Analytics Assistant" },
] as const;

export type AssistantId = (typeof ASSISTANTS)[number]["id"];

export const ASSISTANT_IDS = ASSISTANTS.map(
  (assistant) => assistant.id,
) as unknown as readonly [AssistantId, ...AssistantId[]];

export function assistantLabel(id: string): string {
  return ASSISTANTS.find((assistant) => assistant.id === id)?.label ?? id;
}
