import type { Appearance, RefreshResult, ScheduleAdapter } from "@/contracts";
import { normalizePersonId } from "./people";

type InitializationErrorCode =
  | "BAD_REQUEST"
  | "SEARCH_NOT_CONFIGURED"
  | "AI_NOT_CONFIGURED"
  | "NO_SOURCES_FOUND"
  | "SOURCE_DISCOVERY_FAILED"
  | "INFERENCE_FAILED"
  | "INITIALIZATION_FAILED";

const INITIALIZATION_FAILURE_MESSAGE =
  "No verified or agent-discovered schedule could be found.";

export class InitializationRequestError extends Error {
  constructor(
    readonly code: InitializationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "InitializationRequestError";
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    typeof event.title === "string" &&
    event.title.length > 0 &&
    isNullableString(event.type) &&
    isNullableString(event.start) &&
    isNullableString(event.doors) &&
    isNullableString(event.venue) &&
    isNullableString(event.location) &&
    (event.status === "scheduled" || event.status === "cancelled") &&
    typeof event.sourceUrl === "string" &&
    isHttpsUrl(event.sourceUrl) &&
    (event.verificationStatus === "verified" ||
      event.verificationStatus === "unverified")
  );
}

function isInitializationErrorCode(value: unknown): value is InitializationErrorCode {
  return (
    value === "BAD_REQUEST" ||
    value === "SEARCH_NOT_CONFIGURED" ||
    value === "AI_NOT_CONFIGURED" ||
    value === "NO_SOURCES_FOUND" ||
    value === "SOURCE_DISCOVERY_FAILED" ||
    value === "INFERENCE_FAILED" ||
    value === "INITIALIZATION_FAILED"
  );
}

function initializationError(code: unknown): InitializationRequestError {
  if (code === "BAD_REQUEST") {
    return new InitializationRequestError(
      "BAD_REQUEST",
      "Enter a valid person name."
    );
  }
  if (code === "SEARCH_NOT_CONFIGURED" || code === "AI_NOT_CONFIGURED") {
    return new InitializationRequestError(
      code,
      "Autonomous schedule search isn’t configured."
    );
  }
  return new InitializationRequestError(
    isInitializationErrorCode(code) ? code : "INITIALIZATION_FAILED",
    INITIALIZATION_FAILURE_MESSAGE
  );
}

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

  async initialize(personName) {
    const response = await fetch("/api/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: personName.trim() }),
    });

    if (!response.ok) {
      let code: unknown;
      try {
        const body: unknown = await response.json();
        if (typeof body === "object" && body !== null && "code" in body) {
          code = body.code;
        }
      } catch {
        // A non-JSON gateway response is still an initialization failure.
      }
      throw initializationError(code);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw initializationError("INITIALIZATION_FAILED");
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("events" in body) ||
      !Array.isArray(body.events) ||
      !body.events.every(isAppearance) ||
      body.events.some((event) => event.verificationStatus !== "unverified")
    ) {
      throw initializationError("INITIALIZATION_FAILED");
    }
    return body.events;
  },
};

