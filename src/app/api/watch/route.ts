import { NextResponse } from "next/server";
import { registerPendingWatch } from "@/server/database";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("name" in body)) {
      throw new Error("Missing name");
    }
    const name = body.name;
    if (typeof name !== "string" || !name.trim()) throw new Error("Missing name");

    return NextResponse.json(registerPendingWatch(name), { status: 201 });
  } catch {
    return NextResponse.json(
      { code: "BAD_REQUEST", message: "A person name is required." },
      { status: 400 }
    );
  }
}
