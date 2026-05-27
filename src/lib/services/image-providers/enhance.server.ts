const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a prompt-engineering assistant for a text-to-image tool.

You may be given the active brand's design guidelines. When they are present, use
them to decide whether the prompt fits the brand and to ask sharper, brand-aware
questions (e.g. about palette, tone, typography, or how the brand frames products).

You may also be given one or more reference images the user has attached. These
exact images will be passed to the image model, so treat their contents as already
decided. When reference images are present:
- Do NOT critique or ask about details already visible in them (the subject, its
  colour, or styling shown in the image are settled).
- Focus your critique and questions on what the images alone do not pin down: the
  new setting, composition, lighting, camera, mood, and how the referenced subject
  should be combined with the rest of the scene.
- When enhancing, write the prompt as an instruction that builds on the attached
  image(s) rather than re-describing what they already show.

Given the user's draft prompt, do exactly one of the following and reply with JSON:

1. If the prompt is vague, too generic, internally contradictory, or otherwise
   likely to produce a poor or unpredictable image, respond with:
   - "critique": one or two short sentences naming what is weak about the prompt
     and why it may not produce a good result. Reference the brand guidelines when
     they are relevant.
   - "clarifyingQuestions": up to 3 short questions that would meaningfully improve
     the result. For each, include a short "example" answer (a few words) that
     shows the kind of detail you're looking for.
   {"critique": "...", "clarifyingQuestions": [{"question": "...", "example": "..."}]}

2. Otherwise, rewrite the prompt with richer visual detail, suitable for a
   high-quality image model (honoring the brand guidelines when present), and
   respond with:
   {"enhancedPrompt": "..."}

Reply with valid JSON only. Do not include any prose outside the JSON object.`;

// Used after the user has answered earlier clarifying questions. The model is
// no longer allowed to ask more questions — it must produce a single rewritten
// prompt that integrates the answers into the original prompt naturally.
const REWRITE_WITH_CLARIFICATIONS_PROMPT = `You are a prompt-engineering assistant for a text-to-image tool.

You will receive:
- The user's original draft prompt.
- A list of clarifying questions you previously asked, each paired with the
  user's answer.
- Optionally the active brand's design guidelines.
- Optionally one or more reference images that will be passed to the image model.

Your task is to rewrite the original prompt into a single coherent, vivid image
prompt that fully incorporates the information from the answers. Treat the
answers as facts about the desired image and weave them into the prompt as
natural descriptive language.

Hard rules:
- Do NOT ask any further questions.
- Do NOT include the questions, the answers verbatim, the words "Clarifications",
  "Q:", "A:", bullet lists of Q&A, or any meta-commentary about the rewriting
  process in the output.
- Do NOT prepend or append a separate "Clarifications:" section.
- Output one self-contained prompt as a single string. No markdown sections, no
  headings, no preamble.
- Honour the brand guidelines when present.
- When reference images are attached, write the prompt as an instruction that
  builds on them rather than re-describing what they already show.

Reply with valid JSON only, in exactly this shape and no other keys:
{"enhancedPrompt": "..."}

Do not include any prose outside the JSON object.`;

export interface ClarifyingQuestion {
  question: string;
  example?: string;
}

export interface ClarificationAnswer {
  question: string;
  answer: string;
}

export interface EnhanceResult {
  critique?: string;
  clarifyingQuestions?: ClarifyingQuestion[];
  enhancedPrompt?: string;
}

export interface PromptEnhancerOptions {
  apiKey: string;
  fetch?: typeof fetch;
  model?: string;
  baseUrl?: string;
}

export class PromptEnhancerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PromptEnhancerError";
  }
}

export class PromptEnhancer {
  private readonly fetchFn: typeof fetch;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly options: PromptEnhancerOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com";
  }

  async enhance(
    prompt: string,
    brandGuidelines?: string,
    referenceImages?: string[],
  ): Promise<EnhanceResult> {
    const guidelines = brandGuidelines?.trim();
    const textContent = guidelines
      ? `Brand design guidelines:\n${guidelines}\n\nDraft prompt:\n${prompt}`
      : prompt;

    return this.callChatCompletion(SYSTEM_PROMPT, textContent, referenceImages);
  }

  // Rewrites the original prompt using the user's answers to the previously
  // asked clarifying questions. Always returns an `enhancedPrompt` — the
  // system prompt forbids further questions — so callers can rely on a single
  // coherent prompt without leaking the Q&A formatting.
  async enhanceWithClarifications(
    prompt: string,
    answers: ClarificationAnswer[],
    brandGuidelines?: string,
    referenceImages?: string[],
  ): Promise<EnhanceResult> {
    const cleanedAnswers = answers
      .map((qa) => ({
        question: qa.question.trim(),
        answer: qa.answer.trim(),
      }))
      .filter((qa) => qa.question !== "" && qa.answer !== "");

    if (cleanedAnswers.length === 0) {
      // No usable answers — fall back to a normal enhance pass on the original
      // prompt rather than asking the model to "rewrite with no clarifications".
      return this.enhance(prompt, brandGuidelines, referenceImages);
    }

    const guidelines = brandGuidelines?.trim();
    const sections: string[] = [];
    if (guidelines) {
      sections.push(`Brand design guidelines:\n${guidelines}`);
    }
    sections.push(`Original draft prompt:\n${prompt}`);
    sections.push(
      `Clarifying questions and the user's answers (incorporate these into the rewritten prompt without listing them):\n${cleanedAnswers
        .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
        .join("\n\n")}`,
    );
    const textContent = sections.join("\n\n");

    const result = await this.callChatCompletion(
      REWRITE_WITH_CLARIFICATIONS_PROMPT,
      textContent,
      referenceImages,
    );

    // Defensive: this code path must always end up with an enhancedPrompt.
    if (!result.enhancedPrompt) {
      throw new PromptEnhancerError(
        "Prompt rewrite did not return an enhancedPrompt",
        200,
        result,
      );
    }

    // Drop any stray clarifyingQuestions / critique the model may have leaked
    // through despite the system prompt — callers should not branch on them
    // for the rewrite path.
    return { enhancedPrompt: result.enhancedPrompt };
  }

  private async callChatCompletion(
    systemPrompt: string,
    textContent: string,
    referenceImages?: string[],
  ): Promise<EnhanceResult> {
    const images = (referenceImages ?? []).filter((url) => url.trim() !== "");
    const userMessage =
      images.length > 0
        ? {
            role: "user" as const,
            content: [
              { type: "text" as const, text: textContent },
              ...images.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          }
        : { role: "user" as const, content: textContent };

    const response = await this.fetchFn(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: systemPrompt }, userMessage],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await safeJson(response);
      throw new PromptEnhancerError(
        `Prompt enhancement request failed: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new PromptEnhancerError(
        "Prompt enhancement returned an empty choice",
        response.status,
        json,
      );
    }

    return parseEnhanceContent(content);
  }
}

function parseEnhanceContent(content: string): EnhanceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PromptEnhancerError(
      "Prompt enhancement returned non-JSON content",
      200,
      content,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new PromptEnhancerError(
      "Prompt enhancement JSON is not an object",
      200,
      parsed,
    );
  }

  const obj = parsed as Record<string, unknown>;
  const result: EnhanceResult = {};

  if (typeof obj.critique === "string" && obj.critique.trim()) {
    result.critique = obj.critique.trim();
  }

  const questions = normalizeClarifyingQuestions(obj.clarifyingQuestions);
  if (questions.length > 0) {
    result.clarifyingQuestions = questions;
  }

  if (typeof obj.enhancedPrompt === "string" && obj.enhancedPrompt.trim()) {
    result.enhancedPrompt = obj.enhancedPrompt;
  }

  if (!result.clarifyingQuestions && !result.enhancedPrompt) {
    throw new PromptEnhancerError(
      "Prompt enhancement JSON did not contain clarifyingQuestions or enhancedPrompt",
      200,
      obj,
    );
  }

  return result;
}

// Accept either plain question strings or {question, example} objects so the
// flow keeps working even when the model ignores the example instruction.
function normalizeClarifyingQuestions(value: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(value)) return [];
  const questions: ClarifyingQuestion[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const question = entry.trim();
      if (question) questions.push({ question });
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const question =
        typeof record.question === "string" ? record.question.trim() : "";
      if (!question) continue;
      const example =
        typeof record.example === "string" && record.example.trim()
          ? record.example.trim()
          : undefined;
      questions.push(example ? { question, example } : { question });
    }
  }
  return questions;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
