import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { callKimi, KimiConfigurationError, KimiInferenceError } from "./aiand";

const systemPrompt =
  "Extract only explicitly announced public appearances. Never infer missing facts. Return JSON: {events:[{title,type,start,doors,venue,location,status,sourceUrl}]}. Use ISO 8601 with timezone; use null for unknown values.";

type MockOpenAIInstance = {
  options: Record<string, unknown>;
  chat: { completions: { create: Mock } };
};

const state = vi.hoisted(() => ({
  create: vi.fn(),
  instances: [] as MockOpenAIInstance[],
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    options: Record<string, unknown>;
    chat = { completions: { create: state.create } };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      state.instances.push(this as unknown as MockOpenAIInstance);
    }
  },
}));

function setResponse(content: string | { choices: unknown[] }) {
  if (typeof content === "string") {
    state.create.mockResolvedValue({ choices: [{ message: { content } }] });
  } else {
    state.create.mockResolvedValue(content);
  }
}

describe("callKimi", () => {
  beforeEach(() => {
    state.create.mockReset();
    state.instances.length = 0;
  });

  it("throws AI_NOT_CONFIGURED when env variables are missing", async () => {
    delete process.env.AIAND_API_KEY;
    delete process.env.AIAND_BASE_URL;
    delete process.env.AIAND_MODEL;

    await expect(callKimi("source")).rejects.toBeInstanceOf(
      KimiConfigurationError
    );
  });

  it("configures the client with env values, maxRetries 2, and timeout 20_000", async () => {
    process.env.AIAND_API_KEY = "test-key";
    process.env.AIAND_BASE_URL = "https://api.aiand.com/v1";
    process.env.AIAND_MODEL = "moonshotai/kimi-k2.7-code";
    setResponse("{}");

    await callKimi("source");

    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].options.apiKey).toBe("test-key");
    expect(state.instances[0].options.baseURL).toBe("https://api.aiand.com/v1");
    expect(state.instances[0].options.maxRetries).toBe(2);
    expect(state.instances[0].options.timeout).toBe(20_000);
  });

  it("calls chat.completions.create with the required model, temperature 0, and json_object response_format", async () => {
    process.env.AIAND_API_KEY = "test-key";
    process.env.AIAND_BASE_URL = "https://api.aiand.com/v1";
    process.env.AIAND_MODEL = "moonshotai/kimi-k2.7-code";
    setResponse("{}");

    await callKimi("fixture text");

    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "moonshotai/kimi-k2.7-code",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "fixture text" },
        ],
      })
    );
  });

  it("parses and returns the JSON content from the response", async () => {
    process.env.AIAND_API_KEY = "test-key";
    process.env.AIAND_BASE_URL = "https://api.aiand.com/v1";
    process.env.AIAND_MODEL = "moonshotai/kimi-k2.7-code";
    setResponse('{"events":[]}');

    const result = await callKimi("source");
    expect(result).toEqual({ events: [] });
  });

  it("throws INFERENCE_FAILED when the response content is empty", async () => {
    process.env.AIAND_API_KEY = "test-key";
    process.env.AIAND_BASE_URL = "https://api.aiand.com/v1";
    process.env.AIAND_MODEL = "moonshotai/kimi-k2.7-code";
    setResponse("");

    await expect(callKimi("source")).rejects.toBeInstanceOf(
      KimiInferenceError
    );
  });

  it("throws INFERENCE_FAILED when the response content is invalid JSON", async () => {
    process.env.AIAND_API_KEY = "test-key";
    process.env.AIAND_BASE_URL = "https://api.aiand.com/v1";
    process.env.AIAND_MODEL = "moonshotai/kimi-k2.7-code";
    setResponse("not-json");

    await expect(callKimi("source")).rejects.toBeInstanceOf(
      KimiInferenceError
    );
  });

  it("does not leak the api key in thrown errors", async () => {
    delete process.env.AIAND_API_KEY;
    process.env.AIAND_BASE_URL = "https://api.aiand.com/v1";
    process.env.AIAND_MODEL = "moonshotai/kimi-k2.7-code";

    await expect(callKimi("source")).rejects.toThrow(/AIAND_API_KEY/);
  });
});
