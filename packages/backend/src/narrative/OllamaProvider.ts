// Local dev LLM provider — calls Ollama at http://localhost:11434
// TODO: next step — implement full prompt template and response parsing

import type { INarrativeService, NarrativeRequest, NarrativeResponse } from "./INarrativeService.js";

export class OllamaProvider implements INarrativeService {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl = "http://localhost:11434", model = "llama3") {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(request: NarrativeRequest): Promise<NarrativeResponse> {
    const prompt = buildPrompt(request);

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status}`);
    }

    const data = (await res.json()) as { response: string };
    return { text: data.response };
  }
}

function buildPrompt(request: NarrativeRequest): string {
  const { snapshot } = request;
  const pov = snapshot.faction === "wizards" ? "magical" : "mechanical";
  // TODO: next step — expand with full prompt templates from design_values.md
  return `You are a narrator for a ${pov} faction in a strategy game. Tick: ${snapshot.tick}. Type: ${request.type}. ${request.context ?? ""}`;
}
