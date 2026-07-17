import type { Appearance } from "@/contracts";
import { createId } from "@/domain";

export function validateAppearances(data: unknown): Appearance[] {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("Expected JSON object");
  }

  const payload = data as { events?: unknown };
  if (!Array.isArray(payload.events)) {
    throw new ValidationError("Expected events array");
  }

  return payload.events.map((item, index) => validateEvent(item, index));
}

function validateEvent(item: unknown, index: number): Appearance {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new ValidationError(`Event ${index} is not an object`);
  }

  const event = item as Record<string, unknown>;
  const title = typeof event.title === "string" ? event.title.trim() : "";
  if (!title) throw new ValidationError(`Event ${index} has invalid title`);

  const sourceUrl = typeof event.sourceUrl === "string" ? event.sourceUrl.trim() : "";
  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new ValidationError(`Event ${index} has invalid sourceUrl`);
  }

  const start = optionalString(event.start, "start", index);
  const doors = optionalString(event.doors, "doors", index);
  for (const [field, value] of [["start", start], ["doors", doors]] as const) {
    if (value && Number.isNaN(Date.parse(value))) {
      throw new ValidationError(`Event ${index} has invalid ${field}`);
    }
  }

  const normalized: Appearance = {
    id: "",
    title,
    type: optionalString(event.type, "type", index),
    start,
    doors,
    venue: optionalString(event.venue, "venue", index),
    location: optionalString(event.location, "location", index),
    status: normalizeStatus(event.status, index),
    sourceUrl,
  };
  normalized.id = createId(normalized);
  return normalized;
}

function optionalString(value: unknown, field: string, index: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`Event ${index} has invalid ${field}`);
  }
  return value.trim() || null;
}

function normalizeStatus(value: unknown, index: number): "scheduled" | "cancelled" {
  if (value === null || value === undefined) return "scheduled";
  if (typeof value !== "string") {
    throw new ValidationError(`Event ${index} has invalid status`);
  }
  const status = value.toLowerCase();
  if (status === "scheduled" || status === "cancelled") return status;
  throw new ValidationError(`Event ${index} has invalid status`);
}

export class ValidationError extends Error {
  readonly code = "INFERENCE_FAILED";
}
