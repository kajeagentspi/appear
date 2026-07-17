import { NextResponse } from "next/server";
import {
  KimiConfigurationError,
  KimiInferenceError,
} from "@/server/aiand";
import {
  initializePersonSchedule,
  InvalidPersonNameError,
  NoSourcesFoundError,
} from "@/server/initialize";
import { ValidationError } from "@/server/validate";
import {
  SourceDiscoveryError,
  WebSearchConfigurationError,
} from "@/server/web";

type InitializeErrorCode =
  | "BAD_REQUEST"
  | "SEARCH_NOT_CONFIGURED"
  | "AI_NOT_CONFIGURED"
  | "NO_SOURCES_FOUND"
  | "SOURCE_DISCOVERY_FAILED"
  | "INFERENCE_FAILED"
  | "INITIALIZATION_FAILED";

export async function POST(request: Request) {
  let name: string;
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("name" in body) ||
      typeof body.name !== "string"
    ) {
      throw new Error("Missing name");
    }
    name = body.name;
  } catch {
    return errorResponse(400, "BAD_REQUEST", "Invalid request body");
  }

  try {
    return NextResponse.json(await initializePersonSchedule(name));
  } catch (error) {
    if (error instanceof InvalidPersonNameError) {
      return errorResponse(400, "BAD_REQUEST", "Invalid person name");
    }
    if (error instanceof WebSearchConfigurationError) {
      return errorResponse(
        503,
        "SEARCH_NOT_CONFIGURED",
        "Web search is not configured."
      );
    }
    if (error instanceof KimiConfigurationError) {
      return errorResponse(
        503,
        "AI_NOT_CONFIGURED",
        "AI inference is not configured."
      );
    }
    if (error instanceof NoSourcesFoundError) {
      return errorResponse(
        404,
        "NO_SOURCES_FOUND",
        "No defensible sources or appearances were found."
      );
    }
    if (error instanceof SourceDiscoveryError) {
      return errorResponse(
        502,
        "SOURCE_DISCOVERY_FAILED",
        "Source discovery failed."
      );
    }
    if (error instanceof ValidationError || error instanceof KimiInferenceError) {
      return errorResponse(502, "INFERENCE_FAILED", "Inference failed.");
    }
    return errorResponse(
      502,
      "INITIALIZATION_FAILED",
      "Schedule initialization failed."
    );
  }
}

function errorResponse(
  status: number,
  code: InitializeErrorCode,
  message: string
) {
  return NextResponse.json({ code, message }, { status });
}
