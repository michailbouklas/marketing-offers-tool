import { Agent } from "@mastra/core/agent";
import { getAiChatEnv } from "../env";
import { getChatMemory } from "../memory";
import { userSkillsFor } from "../skills/user-skills-fs";
import { querySalesSql } from "../tools/query-sales-sql";
import { sharedTools } from "../tools/shared";
import {
  buildBrandScopeSection,
  resolveScopedBrands,
} from "./brand-scope-section";
import { buildSalesPageContextSection } from "./sales-page-context-section";

// Placeholder: replaced by the page-specific instructions and typed tools.
const baseInstructions = `
You are the Delivery Assistant inside an internal marketing tool for PHC Franchised
Restaurants (Cyprus). You answer questions about the /sales/delivery page using the
query-sales-sql tool. Load the "sales-sql" skill before writing SQL. Answer
ONLY from tool results; never invent numbers.
`.trim();

/**
 * Chat agent for /sales/delivery. Registered in ../index.ts; exposed via the chat
 * registry (sales:view, brandScoped, pageContext = SalesPageContext).
 */
export const salesDeliveryAgent = new Agent({
  id: "sales-delivery-agent",
  name: "Delivery Assistant",
  instructions: ({ requestContext }) =>
    `${baseInstructions}\n\n${buildBrandScopeSection(resolveScopedBrands(requestContext))}${buildSalesPageContextSection(requestContext, "/sales/delivery")}`,
  model: getAiChatEnv().AI_CHAT_MODEL,
  tools: { ...sharedTools, querySalesSql },
  // Admin-authored skills assigned to this assistant (workspace/user-skills/sales-delivery-agent).
  skills: userSkillsFor("sales-delivery-agent"),
  memory: () => getChatMemory(),
});
