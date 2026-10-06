// Thin wrapper around the Anthropic SDK. All AI features degrade gracefully to the deterministic
// rules engine when ANTHROPIC_API_KEY is not configured or a call fails.

import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;

export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

/**
 * Ask Claude for a JSON object conforming to `schema` (structured outputs).
 * Returns null on any failure so callers can fall back to rules.
 */
export async function callClaudeJSON<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null> {
  if (!llmEnabled()) return null;
  try {
    const response = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error(`[llm] API error ${err.status}: ${err.message}`);
    else console.error("[llm] call failed:", err);
    return null;
  }
}
