// Production LLM provider — calls Claude API (Anthropic)
// TODO: next step — implement full prompt template and response parsing

import type { INarrativeService, NarrativeRequest, NarrativeResponse } from "./INarrativeService.js";

export class ClaudeAPIProvider implements INarrativeService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(request: NarrativeRequest): Promise<NarrativeResponse> {
    const prompt = buildPrompt(request);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API request failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.find((b) => b.type === "text")?.text ?? "";
    return { text };
  }
}

function buildPrompt(request: NarrativeRequest): string {
  const { snapshot } = request;
  const pov = snapshot.faction === "wizards" ? "magical" : "mechanical";
  // TODO: next step — expand with full prompt templates from design_values.md
  return `You are a narrator for a ${pov} faction in a strategy game. Tick: ${snapshot.tick}. Type: ${request.type}. ${request.context ?? ""}`;
}
