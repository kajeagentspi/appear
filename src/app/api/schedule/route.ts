import { NextResponse } from "next/server";
import { getStoredSchedule } from "@/server/database";

export async function GET(request: Request) {
  const personId = new URL(request.url).searchParams.get("personId")?.trim();
  if (!personId) {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: "Missing personId" },
      { status: 400 }
    );
  }

  const schedule = getStoredSchedule(personId);
  if (!schedule) {
    return NextResponse.json(
      { code: "SCHEDULE_NOT_FOUND", message: "No stored schedule was found." },
      { status: 404 }
    );
  }
  return NextResponse.json(schedule);
}
