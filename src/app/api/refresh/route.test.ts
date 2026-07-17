import { beforeEach, describe, expect, it, vi } from "vitest";

const kimi = vi.hoisted(() => {
  class ConfigurationError extends Error {
    readonly code = "AI_NOT_CONFIGURED";
  }
  return {
    call: vi.fn(),
    ConfigurationError,
  };
});

vi.mock("@/server/aiand", () => ({
  callKimi: kimi.call,
  KimiConfigurationError: kimi.ConfigurationError,
}));

const sourceEvent = {
  title: "ILLIT GLITTER DAY IN JAPAN",
  type: "Concert",
  start: "2026-07-23T18:30:00+09:00",
  doors: "2026-07-23T17:00:00+09:00",
  venue: "Toyota Arena Tokyo",
  location: "Tokyo, Japan",
  status: "scheduled",
  sourceUrl: "https://illit-official.jp/schedule/448882bcd3c1",
};

function request(personId = "illit") {
  return new Request("http://localhost/api/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personId }),
  });
}

// Dynamic import resets the route's intentional module-scoped cache between tests.
async function loadPost() {
  const route = await import("./route");
  return route.POST;
}

describe("POST /api/refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    kimi.call.mockReset();
  });

  it("loads stored source text, persists a time correction, and later reports no changes", async () => {
    kimi.call.mockResolvedValue({ events: [sourceEvent] });
    const post = await loadPost();

    const first = await post(request("  ILLIT  "));
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(kimi.call).toHaveBeenCalledWith(expect.stringContaining("Start: 18:30 JST"));
    expect(firstBody.changed).toBe(true);
    expect(firstBody.message).toBe("Updated just now");
    expect(firstBody.events[0].start).toBe("2026-07-23T18:30:00+09:00");

    const second = await post(request());
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.changed).toBe(false);
    expect(secondBody.message).toBe("No changes");
  });

  it("maps missing configuration to 503 AI_NOT_CONFIGURED", async () => {
    kimi.call.mockRejectedValue(new kimi.ConfigurationError("not configured"));
    const post = await loadPost();

    const response = await post(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: "AI_NOT_CONFIGURED",
      changed: false,
    });
    expect(body.events).toHaveLength(4);
  });

  it("maps invalid provider output to 502 INFERENCE_FAILED", async () => {
    kimi.call.mockResolvedValue({ events: [{ title: "Missing source" }] });
    const post = await loadPost();

    const response = await post(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: "INFERENCE_FAILED", changed: false });
    expect(body.events).toHaveLength(4);
  });

  it("preserves the last successful events when the provider later fails", async () => {
    kimi.call.mockResolvedValueOnce({ events: [sourceEvent] });
    const post = await loadPost();
    const successful = await post(request());
    const successfulBody = await successful.json();

    kimi.call.mockRejectedValueOnce(new Error("provider unavailable"));
    const failed = await post(request());
    const failedBody = await failed.json();

    expect(failed.status).toBe(502);
    expect(failedBody.code).toBe("INFERENCE_FAILED");
    expect(failedBody.changed).toBe(false);
    expect(failedBody.events).toEqual(successfulBody.events);
    expect(JSON.stringify(failedBody)).not.toContain("provider unavailable");
  });

  it("rejects malformed request JSON", async () => {
    const post = await loadPost();
    const response = await post(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "BAD_REQUEST" });
    expect(kimi.call).not.toHaveBeenCalled();
  });
});
