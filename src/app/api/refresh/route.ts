import { NextResponse } from "next/server";
import type { Appearance, RefreshResult } from "@/contracts";
import { normalizePersonId } from "@/domain";
import { AiConfigurationError } from "@/server/provider";
import { getStoredSchedule } from "@/server/database";
import {
  refreshPersonSchedule,
  ScheduleNotFoundError,
  ScheduleSourceMissingError,
} from "@/server/refresh";
import { ValidationError } from "@/server/validate";

type RefreshErrorCode =
  | "BAD_REQUEST"
  | "SCHEDULE_NOT_FOUND"
  | "SOURCE_NOT_CONFIGURED"
  | "AI_NOT_CONFIGURED"
  | "INFERENCE_FAILED";

export async function POST(request: Request) {
  let personId: string;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("personId" in body)) {
      throw new Error("Missing personId");
    }
    const value = body.personId;
    if (typeof value !== "string" || !value.trim()) throw new Error("Missing personId");
    personId = normalizePersonId(value);
  } catch {
    return errorResponse(400, "BAD_REQUEST", "Invalid request body", []);
  }

  const existingEvents = getStoredSchedule(personId)?.events ?? [];
  try {
    return NextResponse.json(await refreshPersonSchedule(personId));
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return errorResponse(
        404,
        "SCHEDULE_NOT_FOUND",
        "No stored schedule was found.",
        existingEvents
      );
    }
    if (error instanceof ScheduleSourceMissingError) {
      return errorResponse(
        409,
        "SOURCE_NOT_CONFIGURED",
        "No refresh source is configured.",
        existingEvents
      );
    }
    if (error instanceof AiConfigurationError) {
      return errorResponse(
        503,
        "AI_NOT_CONFIGURED",
        "AI inference is not configured.",
        existingEvents
      );
    }
    if (error instanceof ValidationError) {
      return errorResponse(
        502,
        "INFERENCE_FAILED",
        "Inference failed.",
        existingEvents
      );
    }
    return errorResponse(
      502,
      "INFERENCE_FAILED",
      "Inference failed.",
      existingEvents
    );
  }
}

function errorResponse(
  status: number,
  code: RefreshErrorCode,
  message: string,
  events: Appearance[]
) {
  return NextResponse.json(
    { code, message, events, changed: false } satisfies RefreshResult & {
      code: RefreshErrorCode;
    },
    { status }
  );
}
