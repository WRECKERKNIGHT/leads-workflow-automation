import { config } from "../config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Minimal OpenRouter client. Returns the assistant text.
 * Falls back to deterministic mock output when no key is configured
 * or when MOCK_MODE is on.
 */
export async function complete(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<{ text: string; usedMock: boolean }> {
  if (config.mockMode || !config.openrouterApiKey) {
    return { text: mockReply(messages), usedMock: true };
  }

  const models = [
    config.openrouterModel,
    "minimax/minimax-m3:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemma-4-31b-it:free",
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  let lastErr: Error | null = null;
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openrouterApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 800,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      return { text: json.choices?.[0]?.message?.content ?? "", usedMock: false };
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error("OpenRouter unreachable");
}

function mockReply(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1]?.content ?? "";
  if (/email/i.test(last)) {
    return [
      `Subject: Quick question about ${extractName(last)}`,
      ``,
      `Hello,`,
      ``,
      `I noticed ${extractName(last)} could benefit from a modern digital admissions and communication system.`,
      `Could we set up a short call this week?`,
    ].join("\n");
  }
  return "This is a mock reply generated because no OpenRouter API key is configured. Set OPENROUTER_API_KEY in .env.local to enable real AI output.";
}

function extractName(text: string): string {
  const m = text.match(/institution[:\s]+([^\n,.]+)/i);
  return m?.[1]?.trim() || "your institution";
}
