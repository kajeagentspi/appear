import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Appearance } from "@/contracts";
import {
  getRefreshTarget,
  getStoredSchedule,
  initializeStoredSchedule,
  saveRefreshSuccess,
} from "./database";

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "appear-database-test-"));
const databasePath = path.join(temporaryDirectory, "appear.sqlite");

beforeAll(() => {
  process.env.APPEAR_DB_PATH = databasePath;
  const oldDatabase = new DatabaseSync(databasePath);
  oldDatabase.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE people (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'pending')),
      last_checked_at TEXT,
      next_refresh_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE sources (
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      source_text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (person_id, url)
    );
    CREATE TABLE appearances (
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      start TEXT,
      doors TEXT,
      venue TEXT,
      location TEXT,
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'cancelled')),
      source_url TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (person_id, id)
    );
    INSERT INTO people VALUES (
      'legacy-artist', 'Legacy Artist', 'active', NULL,
      '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z',
      '2026-07-17T00:00:00.000Z'
    );
    INSERT INTO sources VALUES (
      'legacy-artist', 'https://example.com/legacy', 'Preserved legacy source'
    );
    INSERT INTO appearances VALUES (
      'legacy-artist', 'legacy-event', 'Preserved Legacy Event', 'Concert',
      '2026-10-01', NULL, 'Legacy Hall', 'Seoul, South Korea', 'scheduled',
      'https://example.com/legacy', '2026-07-17T00:00:00.000Z'
    );
  `);
  oldDatabase.close();
});

afterAll(() => {
  delete process.env.APPEAR_DB_PATH;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

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
  verificationStatus: "unverified",
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
    expect(
      schedule?.events.every(
        (event) => event.verificationStatus === "verified"
      )
    ).toBe(true);
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
    expect(
      schedule?.events.every(
        (event) => event.verificationStatus === "verified"
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

  it("migrates an old sources table without losing its schedule", () => {
    const schedule = getStoredSchedule(" Legacy Artist ");
    const target = getRefreshTarget("legacy-artist");

    expect(schedule).toMatchObject({
      personId: "legacy-artist",
      displayName: "Legacy Artist",
      events: [
        {
          id: "legacy-event",
          title: "Preserved Legacy Event",
          verificationStatus: "unverified",
        },
      ],
    });
    expect(target?.sourceUrls).toEqual(["https://example.com/legacy"]);
    expect(target?.sourceText).toBe("Preserved legacy source");
  });

  it("persists an autonomous initialization as unverified immediately", () => {
    const input = {
      personId: "new artist",
      displayName: "New Artist",
      sources: [
        {
          url: "https://example.com/new-artist/schedule",
          sourceText: "New Artist official schedule",
          verificationStatus: "unverified" as const,
        },
      ],
      events: [
        {
          ...storedEvent,
          sourceUrl: "https://example.com/new-artist/schedule",
        },
      ],
    };

    const initialized = initializeStoredSchedule(input);
    const normalizedLookup = getStoredSchedule("  NEW ARTIST  ");
    const target = getRefreshTarget("new-artist");

    expect(initialized).toEqual(normalizedLookup);
    expect(normalizedLookup).toMatchObject({
      personId: "new-artist",
      displayName: "New Artist",
      status: "active",
      events: [
        {
          id: storedEvent.id,
          verificationStatus: "unverified",
        },
      ],
    });
    expect(target?.sourceUrls).toEqual([
      "https://example.com/new-artist/schedule",
    ]);
    expect(target?.sourceText).toBe("New Artist official schedule");

    const repeated = initializeStoredSchedule(input);
    expect(repeated.events).toEqual(initialized.events);
    expect(getStoredSchedule("new-artist")?.events).toEqual(initialized.events);
    expect(getRefreshTarget("new-artist")?.sourceUrls).toEqual([
      "https://example.com/new-artist/schedule",
    ]);
  });

  it("leaves the previous schedule intact when source attribution is invalid", () => {
    const validInput = {
      personId: "rollback artist",
      displayName: "Rollback Artist",
      sources: [
        {
          url: "https://example.com/rollback/schedule",
          sourceText: "Original source",
          verificationStatus: "unverified" as const,
        },
      ],
      events: [
        {
          ...storedEvent,
          id: "rollback-original",
          sourceUrl: "https://example.com/rollback/schedule",
        },
      ],
    };
    const original = initializeStoredSchedule(validInput);

    expect(() =>
      initializeStoredSchedule({
        ...validInput,
        sources: [
          {
            url: "https://example.com/rollback/replacement",
            sourceText: "Replacement source",
            verificationStatus: "unverified",
          },
        ],
      })
    ).toThrow("outside the submitted source set");

    expect(getStoredSchedule("rollback-artist")).toEqual(original);
    expect(getRefreshTarget("rollback-artist")?.sourceText).toBe(
      "Original source"
    );
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
