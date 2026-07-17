import type { Appearance, RefreshResult, ScheduleAdapter } from "@/contracts";
import { normalizePersonId } from "./people";

export class RefreshRequestError extends Error {
  constructor(
    readonly code:
      | "SCHEDULE_NOT_FOUND"
      | "SOURCE_NOT_CONFIGURED"
      | "AI_NOT_CONFIGURED"
      | "INFERENCE_FAILED",
    message: string
  ) {
    super(message);
    this.name = "RefreshRequestError";
  }
}

export const apiAdapter: ScheduleAdapter = {
  async load(personId) {
    const response = await fetch(
      `/api/schedule?personId=${encodeURIComponent(normalizePersonId(personId))}`
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Schedule load failed with ${response.status}`);

    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("events" in body) ||
      !Array.isArray(body.events)
    ) {
      throw new Error("Schedule response was invalid");
    }
    return body.events as Appearance[];
  },

  async refresh(personId) {
    const response = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: normalizePersonId(personId) }),
    });

    if (!response.ok) {
      let code: unknown;
      try {
        const body: unknown = await response.json();
        if (typeof body === "object" && body !== null && "code" in body) {
          code = body.code;
        }
      } catch {
        // A non-JSON gateway response is still a refresh failure.
      }
      if (code === "AI_NOT_CONFIGURED") {
        throw new RefreshRequestError(
          "AI_NOT_CONFIGURED",
          "Live refresh isn’t configured."
        );
      }
      if (code === "SOURCE_NOT_CONFIGURED") {
        throw new RefreshRequestError(
          "SOURCE_NOT_CONFIGURED",
          "No refresh source is configured."
        );
      }
      if (code === "SCHEDULE_NOT_FOUND") {
        throw new RefreshRequestError(
          "SCHEDULE_NOT_FOUND",
          "No stored schedule was found."
        );
      }
      throw new RefreshRequestError(
        "INFERENCE_FAILED",
        "Update failed. Tap Refresh to try again."
      );
    }

    return (await response.json()) as RefreshResult;
  },
};

export async function registerPendingWatch(name: string): Promise<void> {
  const response = await fetch("/api/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!response.ok) throw new Error(`Watch registration failed with ${response.status}`);
}
