import OpenAI from "openai";

export class KimiConfigurationError extends Error {
  readonly code = "AI_NOT_CONFIGURED";
}

export class KimiInferenceError extends Error {
  readonly code = "INFERENCE_FAILED";
}

export async function callKimi(sourceText: string): Promise<unknown> {
  const apiKey = process.env.AIAND_API_KEY;
  const baseURL = process.env.AIAND_BASE_URL;
  const model = process.env.AIAND_MODEL;

  if (!apiKey || !baseURL || !model) {
    const missing = [
      !apiKey && "AIAND_API_KEY",
      !baseURL && "AIAND_BASE_URL",
      !model && "AIAND_MODEL",
    ]
      .filter(Boolean)
      .join(", ");
    throw new KimiConfigurationError(`Missing ai& configuration: ${missing}`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
    maxRetries: 2,
    timeout: 20_000,
  });

  const result = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract only explicitly announced public appearances. Never infer missing facts. Return JSON: {events:[{title,type,start,doors,venue,location,status,sourceUrl}]}. Use ISO 8601 with timezone; use null for unknown values.",
      },
      { role: "user", content: sourceText },
    ],
  });

  const content = result.choices[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new KimiInferenceError("Kimi returned empty content");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new KimiInferenceError("Kimi returned invalid JSON");
  }
}
