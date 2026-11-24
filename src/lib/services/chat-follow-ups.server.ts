import { Agent } from "@mastra/core/agent";
import { getChatFollowUpsEnv } from "$lib/server/mastra/env";
import { assistantLabel } from "$lib/services/skills/assistants";

export const FOLLOW_UP_COUNT = 3;
const MAX_QUESTION_LENGTH = 160;

const SYSTEM = `You suggest follow-up questions for a chat between a user and an internal data assistant.
Given the user's last question and the assistant's answer, write exactly ${FOLLOW_UP_COUNT} short questions the user is likely to ask next.
- Each one is phrased as the user would type it, is specific to this exchange, and is answerable by the same assistant.
- Use the names, brands, dates and metrics that appear in the exchange; do not invent others.
- Same language as the user's question. At most 15 words each.
- Output only the questions, one per line: no numbering, no bullets, no quotes.`;

const globalForAgent = globalThis as unknown as {
  __chatFollowUpsAgent?: Agent;
};

function getAgent(): Agent {
  globalForAgent.__chatFollowUpsAgent ??= new Agent({
    id: "chat-follow-ups",
    name: "Chat follow-ups",
    instructions: SYSTEM,
    model: getChatFollowUpsEnv().CHAT_FOLLOW_UPS_MODEL,
    maxRetries: 1,
  });
  return globalForAgent.__chatFollowUpsAgent;
}

/** One question per line; tolerates the bullets, numbers and quotes models add anyway. */
export function parseFollowUps(text: string): string[] {
  const questions = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^["'“]+|["'”]+$/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0 && line.length <= MAX_QUESTION_LENGTH);
  return [...new Set(questions)].slice(0, FOLLOW_UP_COUNT);
}

export async function suggestFollowUps(input: {
  agentId: string;
  question: string;
  answer: string;
}): Promise<string[]> {
  const result = await getAgent().generate([
    {
      role: "user",
      content: `Assistant: ${assistantLabel(input.agentId)}\n\nUser's question:\n${input.question}\n\nAssistant's answer:\n${input.answer}`,
    },
  ]);
  return parseFollowUps(result.text ?? "");
}
