import { describe, expect, it } from "vitest";
import type { Appearance } from "@/contracts";
import {
  getRefreshTarget,
  getStoredSchedule,
  listDueRefreshPersonIds,
  registerPendingWatch,
  saveRefreshSuccess,
} from "./database";

const storedEvent: Appearance = {
  id: "new-artist-2026-09-01",
  title: "New Artist Showcase",
  type: "Showcase",
  start: "2026-09-01T19:00:00+09:00",
  doors: "2026-09-01T18:00:00+09:00",
  venue: "Sample Hall",
  location: "Tokyo, Japan",
  status: "scheduled",
  sourceUrl: "https://example.com/new-artist/showcase",
};

describe("SQLite refresh registry", () => {
  it("stores the seeded schedule, source URLs, and source text in SQLite", () => {
    const schedule = getStoredSchedule("  ILLIT  ");
    const target = getRefreshTarget("illit");

    expect(schedule).toMatchObject({
      personId: "illit",
      displayName: "ILLIT",
      status: "active",
    });
    expect(schedule?.events).toHaveLength(4);
    expect(target?.sourceUrls).toEqual([
      "https://illit-official.jp/schedule/448882bcd3c1",
      "https://illit-official.jp/schedule/a67dbfc0afb0",
    ]);
    expect(target?.sourceText).toContain("Start: 18:30 JST");
    expect(listDueRefreshPersonIds()).toContain("illit");
  });

  it("persists a pending watch without inventing a refresh source", () => {
    const pending = registerPendingWatch("  New Artist  ");

    expect(pending).toMatchObject({
      personId: "new-artist",
      displayName: "New Artist",
      status: "pending",
      events: [],
    });
    expect(getRefreshTarget("new-artist")?.sourceText).toBe("");
    expect(listDueRefreshPersonIds()).not.toContain("new-artist");
  });

  it("atomically persists refreshed appearances and refresh timestamps", () => {
    registerPendingWatch("Another Artist");
    const checkedAt = new Date("2026-07-17T10:00:00Z");
    saveRefreshSuccess("another-artist", [storedEvent], checkedAt);

    const schedule = getStoredSchedule("another-artist");
    expect(schedule?.status).toBe("active");
    expect(schedule?.lastCheckedAt).toBe(checkedAt.toISOString());
    expect(schedule?.nextRefreshAt).toBe("2026-07-17T10:15:00.000Z");
    expect(schedule?.events).toEqual([storedEvent]);
  });
});
