import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/schedule", () => {
  it("returns a stored schedule from SQLite", async () => {
    const response = await GET(
      new Request("http://localhost/api/schedule?personId=ILLIT")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      personId: "illit",
      displayName: "ILLIT",
      status: "active",
    });
    expect(body.events).toHaveLength(4);
  });

  it("returns 404 for a person not registered in SQLite", async () => {
    const response = await GET(
      new Request("http://localhost/api/schedule?personId=not-stored")
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "SCHEDULE_NOT_FOUND",
    });
  });
});
