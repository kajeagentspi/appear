import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Appearance } from "@/contracts";
import { normalizePersonId } from "@/domain/people";


interface PersonRow {
  id: string;
  display_name: string;
  status: "active" | "pending";
  last_checked_at: string | null;
}

interface SourceRow {
  url: string;
  source_text: string;
}

interface AppearanceRow {
  id: string;
  title: string;
  type: string | null;
  start: string | null;
  doors: string | null;
  venue: string | null;
  location: string | null;
  status: "scheduled" | "cancelled";
  source_url: string;
}

export interface StoredSchedule {
  personId: string;
  displayName: string;
  status: "active" | "pending";
  lastCheckedAt: string | null;
  events: Appearance[];
}

export interface RefreshTarget extends StoredSchedule {
  sourceText: string;
  sourceUrls: string[];
}

let database: DatabaseSync | null = null;

function getDatabase(): DatabaseSync {
  if (database) return database;

  const configuredPath = process.env.APPEAR_DB_PATH?.trim();
  const filename = configuredPath || path.join(process.cwd(), "data", "appear.sqlite");
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });

  database = new DatabaseSync(filename);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'pending')),
      last_checked_at TEXT,
      next_refresh_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      source_text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (person_id, url)
    );

    CREATE TABLE IF NOT EXISTS appearances (
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


    INSERT OR IGNORE INTO people (
      id, display_name, status, last_checked_at, next_refresh_at, created_at, updated_at
    ) VALUES (
      'illit', 'ILLIT', 'active', NULL,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );

    INSERT OR IGNORE INTO sources (person_id, url, source_text) VALUES (
      'illit',
      'https://illit-official.jp/schedule/448882bcd3c1',
      'ILLIT official schedule

Sources:
- https://illit-official.jp/schedule/448882bcd3c1
- https://illit-official.jp/schedule/a67dbfc0afb0

Events:
- ILLIT GLITTER DAY IN JAPAN
  Type: Concert
  Date: 2026-07-23 (JST)
  Doors: 17:00 JST
  Start: 18:30 JST
  Venue: Toyota Arena Tokyo
  Location: Tokyo, Japan
  Status: scheduled
  Source: https://illit-official.jp/schedule/448882bcd3c1

- ILLIT GLITTER DAY IN JAPAN
  Type: Concert
  Date: 2026-07-25 (JST)
  Doors: 16:00 JST
  Start: 17:30 JST
  Venue: Toyota Arena Tokyo
  Location: Tokyo, Japan
  Status: scheduled
  Source: https://illit-official.jp/schedule/a67dbfc0afb0

- ILLIT GLITTER DAY IN JAPAN
  Type: Concert
  Date: 2026-07-26 (JST)
  Doors: 15:00 JST
  Start: 16:30 JST
  Venue: Toyota Arena Tokyo
  Location: Tokyo, Japan
  Status: scheduled
  Source: https://illit-official.jp/schedule/448882bcd3c1

- LuckyFes ’26
  Type: Festival
  Date: 2026-08-09 (JST)
  Doors: TBA
  Start: TBA
  Venue: Hitachi Seaside Park
  Location: Ibaraki, Japan
  Status: scheduled
  Source: https://illit-official.jp/schedule/a67dbfc0afb0'
    );

    INSERT OR IGNORE INTO sources (person_id, url, source_text) VALUES (
      'illit', 'https://illit-official.jp/schedule/a67dbfc0afb0', ''
    );

    INSERT OR IGNORE INTO appearances VALUES
      ('illit', '0lx2962', 'ILLIT GLITTER DAY IN JAPAN', 'Concert',
       '2026-07-23T18:00:00+09:00', '2026-07-23T17:00:00+09:00',
       'Toyota Arena Tokyo', 'Tokyo, Japan', 'scheduled',
       'https://illit-official.jp/schedule/448882bcd3c1',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('illit', '1s6elyk', 'ILLIT GLITTER DAY IN JAPAN', 'Concert',
       '2026-07-25T17:30:00+09:00', '2026-07-25T16:00:00+09:00',
       'Toyota Arena Tokyo', 'Tokyo, Japan', 'scheduled',
       'https://illit-official.jp/schedule/a67dbfc0afb0',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('illit', '1dsird9', 'ILLIT GLITTER DAY IN JAPAN', 'Concert',
       '2026-07-26T16:30:00+09:00', '2026-07-26T15:00:00+09:00',
       'Toyota Arena Tokyo', 'Tokyo, Japan', 'scheduled',
       'https://illit-official.jp/schedule/448882bcd3c1',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('illit', '0iwqyhz', 'LuckyFes ’26', 'Festival',
       '2026-08-09', NULL, 'Hitachi Seaside Park', 'Ibaraki, Japan',
       'scheduled', 'https://illit-official.jp/schedule/a67dbfc0afb0',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

    INSERT OR IGNORE INTO people (
      id, display_name, status, last_checked_at, next_refresh_at, created_at, updated_at
    ) VALUES (
      'le-sserafim', 'LE SSERAFIM', 'active', NULL,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );

    INSERT OR IGNORE INTO sources (person_id, url, source_text) VALUES (
      'le-sserafim',
      'https://www.le-sserafim.jp/schedule',
      'LE SSERAFIM official schedule snapshot

Source: https://www.le-sserafim.jp/schedule
Snapshot date: 2026-07-17

Upcoming events:
- 2026-07-25 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<大阪>
- 2026-07-26 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<大阪>
- 2026-07-30 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<神奈川>
- 2026-08-01 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<神奈川>
- 2026-08-02 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<神奈川>
- 2026-08-05 | EVENT＆LIVE | 8月5日(水)ZOZOマリンスタジアムで行われる「千葉ロッテマリーンズVS埼玉西武戦」にHONG EUNCHAEがスペシャルゲストとして出演決定！
- 2026-08-08 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<静岡>
- 2026-08-09 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<静岡>
- 2026-08-14 | EVENT＆LIVE | 『SUMMER SONIC 2026』出演決定！<大阪>
- 2026-08-16 | EVENT＆LIVE | 『SUMMER SONIC 2026』出演決定！<東京>
- 2026-08-18 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<宮城>
- 2026-08-19 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<宮城>
- 2026-09-02 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<福岡>
- 2026-09-03 | EVENT＆LIVE | 2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<福岡>'
    );

    INSERT OR IGNORE INTO appearances (
      person_id, id, title, type, start, doors, venue, location,
      status, source_url, updated_at
    ) VALUES
      ('le-sserafim', 'cd9a55a1ecee',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<大阪>', 'EVENT＆LIVE',
       '2026-07-25', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '14228df7af90',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<大阪>', 'EVENT＆LIVE',
       '2026-07-26', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '2d3c40a92567',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<神奈川>', 'EVENT＆LIVE',
       '2026-07-30', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', 'b2a0f9bf625f',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<神奈川>', 'EVENT＆LIVE',
       '2026-08-01', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '747b697cf6bd',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<神奈川>', 'EVENT＆LIVE',
       '2026-08-02', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '2af83900ca7d',
       '8月5日(水)ZOZOマリンスタジアムで行われる「千葉ロッテマリーンズVS埼玉西武戦」にHONG EUNCHAEがスペシャルゲストとして出演決定！',
       'EVENT＆LIVE', '2026-08-05', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', 'd36136c35661',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<静岡>', 'EVENT＆LIVE',
       '2026-08-08', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', 'b0d0a8482d26',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<静岡>', 'EVENT＆LIVE',
       '2026-08-09', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', 'yefbqx',
       '『SUMMER SONIC 2026』出演決定！<大阪>', 'EVENT＆LIVE',
       '2026-08-14', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', 'uhegth',
       '『SUMMER SONIC 2026』出演決定！<東京>', 'EVENT＆LIVE',
       '2026-08-16', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', 'd92459ce0aa3',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<宮城>', 'EVENT＆LIVE',
       '2026-08-18', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '1fc6d0d187f5',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<宮城>', 'EVENT＆LIVE',
       '2026-08-19', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '2d80a4a36ff6',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<福岡>', 'EVENT＆LIVE',
       '2026-09-02', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('le-sserafim', '99e18e89321a',
       '2026 LE SSERAFIM TOUR ''PUREFLOW'' IN JAPAN<福岡>', 'EVENT＆LIVE',
       '2026-09-03', NULL, NULL, NULL, 'scheduled',
       'https://www.le-sserafim.jp/schedule',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);

  return database;
}

function rowsToAppearances(rows: AppearanceRow[]): Appearance[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    start: row.start,
    doors: row.doors,
    venue: row.venue,
    location: row.location,
    status: row.status,
    sourceUrl: row.source_url,
  }));
}

export function getStoredSchedule(personId: string): StoredSchedule | null {
  const id = normalizePersonId(personId);
  const db = getDatabase();
  const person = db
    .prepare(
      `SELECT id, display_name, status, last_checked_at
       FROM people WHERE id = ?`
    )
    .get(id) as PersonRow | undefined;
  if (!person) return null;

  const rows = db
    .prepare(
      `SELECT id, title, type, start, doors, venue, location, status, source_url
       FROM appearances WHERE person_id = ?
       ORDER BY CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, id`
    )
    .all(id) as unknown as AppearanceRow[];

  return {
    personId: person.id,
    displayName: person.display_name,
    status: person.status,
    lastCheckedAt: person.last_checked_at,
    events: rowsToAppearances(rows),
  };
}

export function getRefreshTarget(personId: string): RefreshTarget | null {
  const schedule = getStoredSchedule(personId);
  if (!schedule) return null;

  const rows = getDatabase()
    .prepare(
      `SELECT url, source_text FROM sources
       WHERE person_id = ? ORDER BY url`
    )
    .all(schedule.personId) as unknown as SourceRow[];

  return {
    ...schedule,
    sourceText: rows
      .map((row) => row.source_text.trim())
      .filter(Boolean)
      .join("\n\n"),
    sourceUrls: rows.map((row) => row.url),
  };
}

export function getDefaultStoredSchedule(): StoredSchedule | null {
  const row = getDatabase()
    .prepare(
      `SELECT id
       FROM people
       WHERE status = 'active'
       ORDER BY created_at, id
       LIMIT 1`
    )
    .get() as unknown as { id: string } | undefined;
  return row ? getStoredSchedule(row.id) : null;
}


export function saveRefreshSuccess(
  personId: string,
  events: Appearance[],
  checkedAt: Date = new Date()
): void {
  const id = normalizePersonId(personId);
  const db = getDatabase();
  const checked = checkedAt.toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM appearances WHERE person_id = ?").run(id);
    const insert = db.prepare(
      `INSERT INTO appearances (
         person_id, id, title, type, start, doors, venue, location,
         status, source_url, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const event of events) {
      insert.run(
        id,
        event.id,
        event.title,
        event.type,
        event.start,
        event.doors,
        event.venue,
        event.location,
        event.status,
        event.sourceUrl,
        checked
      );
    }
    db.prepare(
      `UPDATE people
       SET status = 'active', last_checked_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(checked, checked, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

