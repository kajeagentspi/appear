import { describe, expect, it } from "vitest";
import { getStoredSchedule } from "@/server/database";
import { POST } from "./route";

describe("POST /api/watch", () => {
  it("stores a normalized pending watch in SQLite", async () => {
    const response = await POST(
      new Request("http://localhost/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  New Artist  " }),
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      personId: "new-artist",
      displayName: "New Artist",
      status: "pending",
    });
    expect(getStoredSchedule("new-artist")?.status).toBe("pending");
  });

  it("rejects an empty name", async () => {
    const response = await POST(
      new Request("http://localhost/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      })
    );

    expect(response.status).toBe(400);
  });
});
