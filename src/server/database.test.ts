import { describe, expect, it } from "vitest";
import type { Appearance } from "@/contracts";
import {
  getRefreshTarget,
  getStoredSchedule,
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
  });

  it("resolves the seeded LE SSERAFIM schedule from its normalized name", () => {
    const officialSourceUrl = "https://www.le-sserafim.jp/schedule";
    const expectedEvents = [
      {
        id: "cd9a55a1ecee",
        start: "2026-07-25",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<大阪>",
      },
      {
        id: "14228df7af90",
        start: "2026-07-26",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<大阪>",
      },
      {
        id: "2d3c40a92567",
        start: "2026-07-30",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<神奈川>",
      },
      {
        id: "b2a0f9bf625f",
        start: "2026-08-01",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<神奈川>",
      },
      {
        id: "747b697cf6bd",
        start: "2026-08-02",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<神奈川>",
      },
      {
        id: "2af83900ca7d",
        start: "2026-08-05",
        title:
          "8月5日(水)ZOZOマリンスタジアムで行われる「千葉ロッテマリーンズVS埼玉西武戦」にHONG EUNCHAEがスペシャルゲストとして出演決定！",
      },
      {
        id: "d36136c35661",
        start: "2026-08-08",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<静岡>",
      },
      {
        id: "b0d0a8482d26",
        start: "2026-08-09",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<静岡>",
      },
      {
        id: "yefbqx",
        start: "2026-08-14",
        title: "『SUMMER SONIC 2026』出演決定！<大阪>",
      },
      {
        id: "uhegth",
        start: "2026-08-16",
        title: "『SUMMER SONIC 2026』出演決定！<東京>",
      },
      {
        id: "d92459ce0aa3",
        start: "2026-08-18",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<宮城>",
      },
      {
        id: "1fc6d0d187f5",
        start: "2026-08-19",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<宮城>",
      },
      {
        id: "2d80a4a36ff6",
        start: "2026-09-02",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<福岡>",
      },
      {
        id: "99e18e89321a",
        start: "2026-09-03",
        title: "2026 LE SSERAFIM TOUR 'PUREFLOW' IN JAPAN<福岡>",
      },
    ];

    const schedule = getStoredSchedule("  LE SSERAFIM  ");
    const target = getRefreshTarget("le-sserafim");

    expect(schedule).toMatchObject({
      personId: "le-sserafim",
      displayName: "LE SSERAFIM",
      status: "active",
    });
    expect(
      schedule?.events.map(({ id, start, title }) => ({ id, start, title }))
    ).toEqual(expectedEvents);
    expect(
      schedule?.events.every(
        (event) =>
          event.type === "EVENT＆LIVE" &&
          event.status === "scheduled" &&
          event.sourceUrl === officialSourceUrl
      )
    ).toBe(true);
    expect(target?.sourceUrls).toEqual([officialSourceUrl]);
    expect(target?.sourceText).toContain("Snapshot date: 2026-07-17");
    for (const event of expectedEvents) {
      expect(target?.sourceText).toContain(
        `${event.start} | EVENT＆LIVE | ${event.title}`
      );
    }
  });


  it("atomically persists manual refresh appearances and check time", () => {
    const checkedAt = new Date("2026-07-17T10:00:00Z");
    saveRefreshSuccess("illit", [storedEvent], checkedAt);

    const schedule = getStoredSchedule("illit");
    expect(schedule?.status).toBe("active");
    expect(schedule?.lastCheckedAt).toBe(checkedAt.toISOString());
    expect(schedule?.events).toEqual([storedEvent]);
  });
});
