import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class InvalidPersonNameError extends Error {}
  class NoSourcesFoundError extends Error {}
  class WebSearchConfigurationError extends Error {}
  class SourceDiscoveryError extends Error {}
  class KimiConfigurationError extends Error {}
  class KimiInferenceError extends Error {}
  class ValidationError extends Error {}
  return {
    initialize: vi.fn(),
    InvalidPersonNameError,
    NoSourcesFoundError,
    WebSearchConfigurationError,
    SourceDiscoveryError,
    KimiConfigurationError,
    KimiInferenceError,
    ValidationError,
  };
});

vi.mock("@/server/initialize", () => ({
  initializePersonSchedule: routeMocks.initialize,
  InvalidPersonNameError: routeMocks.InvalidPersonNameError,
  NoSourcesFoundError: routeMocks.NoSourcesFoundError,
}));

vi.mock("@/server/web", () => ({
  WebSearchConfigurationError: routeMocks.WebSearchConfigurationError,
  SourceDiscoveryError: routeMocks.SourceDiscoveryError,
}));

vi.mock("@/server/aiand", () => ({
  KimiConfigurationError: routeMocks.KimiConfigurationError,
  KimiInferenceError: routeMocks.KimiInferenceError,
}));

vi.mock("@/server/validate", () => ({
  ValidationError: routeMocks.ValidationError,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const result = {
  personId: "new-artist",
  displayName: "New Artist",
  events: [],
  sourceUrls: ["https://official.example/schedule"],
  verificationStatus: "unverified" as const,
};

describe("POST /api/initialize", () => {
  beforeEach(() => {
    routeMocks.initialize.mockReset();
    routeMocks.initialize.mockResolvedValue(result);
  });

  it("initializes the requested name and returns the result", async () => {
    const response = await POST(request({ name: "  New Artist  " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(routeMocks.initialize).toHaveBeenCalledWith("  New Artist  ");
  });

  it.each([
    ["malformed JSON", "malformed"],
    ["missing name", JSON.stringify({})],
    ["non-string name", JSON.stringify({ name: 42 })],
  ])("maps %s to 400 BAD_REQUEST", async (_label, body) => {
    const response = await POST(
      new Request("http://localhost/api/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "BAD_REQUEST",
      message: "Invalid request body",
    });
    expect(routeMocks.initialize).not.toHaveBeenCalled();
  });

  it.each([
    [routeMocks.InvalidPersonNameError, 400, "BAD_REQUEST"],
    [
      routeMocks.WebSearchConfigurationError,
      503,
      "SEARCH_NOT_CONFIGURED",
    ],
    [routeMocks.KimiConfigurationError, 503, "AI_NOT_CONFIGURED"],
    [routeMocks.NoSourcesFoundError, 404, "NO_SOURCES_FOUND"],
    [routeMocks.SourceDiscoveryError, 502, "SOURCE_DISCOVERY_FAILED"],
    [routeMocks.ValidationError, 502, "INFERENCE_FAILED"],
    [routeMocks.KimiInferenceError, 502, "INFERENCE_FAILED"],
    [Error, 502, "INITIALIZATION_FAILED"],
  ])("maps %s to %i %s without exposing the error", async (
    ErrorType,
    status,
    code
  ) => {
    routeMocks.initialize.mockRejectedValue(new ErrorType("sensitive upstream detail"));

    const response = await POST(request({ name: "New Artist" }));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toEqual({ code, message: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("sensitive upstream detail");
  });
});
