import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appearance } from "@/contracts";
import {
  apiAdapter,
  buildGoogleCalendarUrl,
  createId,
  diffAppearances,
  formatRelativeTime,
  generateIcs,
  InitializationRequestError,
  isFollowed,
  loadFollowed,
  normalizePersonId,
  RefreshRequestError,
  sortAppearances,
  toggleFollow,
} from ".";

const timedEvent: Appearance = {
  id: "sample-live-2026-07-23",
  title: "Sample Act Live",
  type: "Concert",
  start: "2026-07-23T18:00:00+09:00",
  doors: "2026-07-23T17:00:00+09:00",
  venue: "Tokyo Arena",
  location: "Tokyo, Japan",
  status: "scheduled",
  sourceUrl: "https://example.com/schedule/live",
  verificationStatus: "verified",
};

const allDayEvent: Appearance = {
  ...timedEvent,
  id: "sample-festival-2026-08-09",
  title: "Sample Festival",
  type: "Festival",
  start: "2026-08-09",
  doors: null,
  venue: "Seaside Park",
  location: "Ibaraki, Japan",
};

describe("APPEAR domain", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes arbitrary person names into stable IDs", () => {
    expect(normalizePersonId("  New Artist & Co.  ")).toBe("new-artist-co");
    expect(normalizePersonId("ILLIT")).toBe(normalizePersonId("  illit  "));
  });

  it("sorts dated appearances first and undated appearances last", () => {
    const undated = { ...timedEvent, id: "undated", start: null };
    const sorted = sortAppearances([undated, allDayEvent, timedEvent]);

    expect(sorted.map((event) => event.id)).toEqual([
      timedEvent.id,
      allDayEvent.id,
      "undated",
    ]);
  });

  it("generates a valid JST calendar event with escaped event details", () => {
    const calendar = generateIcs({ ...timedEvent, title: "Sample, Tokyo; Live" });

    expect(calendar).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(calendar).toContain("BEGIN:VTIMEZONE\r\nTZID:Asia/Tokyo");
    expect(calendar).toContain("SUMMARY:Sample\\, Tokyo\\; Live");
    expect(calendar).toContain("DTSTART;TZID=Asia/Tokyo:20260723T180000");
    expect(calendar).toContain("DTEND;TZID=Asia/Tokyo:20260723T200000");
    expect(calendar).toContain("LOCATION:Tokyo Arena\\, Tokyo\\, Japan");
    expect(calendar).toMatch(/END:VEVENT\r\nEND:VCALENDAR\r\n$/);
  });

  it("generates an all-day calendar boundary when the date is known but time is TBA", () => {
    const calendar = generateIcs(allDayEvent);

    expect(calendar).toContain("DTSTART;VALUE=DATE:20260809");
    expect(calendar).toContain("DTEND;VALUE=DATE:20260810");
  });

  it("builds a prefilled Google Calendar link for the selected event", () => {
    const url = new URL(buildGoogleCalendarUrl(timedEvent));

    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Sample Act Live");
    expect(url.searchParams.get("dates")).toBe(
      "20260723T090000Z/20260723T110000Z"
    );
    expect(url.searchParams.get("ctz")).toBe("Asia/Tokyo");
    expect(url.searchParams.get("location")).toBe("Tokyo Arena, Tokyo, Japan");
    expect(url.searchParams.get("details")).toContain(timedEvent.sourceUrl);
  });

  it("keeps deterministic IDs across a time correction and reports the change once", () => {
    const corrected = { ...timedEvent, start: "2026-07-23T18:30:00+09:00" };
    corrected.id = createId(corrected);
    const original = { ...timedEvent, id: createId(timedEvent) };

    expect(corrected.id).toBe(original.id);
    expect(diffAppearances([original], [corrected])).toEqual({
      events: [corrected],
      changed: true,
    });
    expect(diffAppearances([corrected], [corrected]).changed).toBe(false);
  });

  it("persists follow state locally and ignores malformed storage", () => {
    expect(toggleFollow("  sample-act  ")).toBe(true);
    expect(isFollowed("sample-act")).toBe(true);
    expect(loadFollowed()).toEqual(["sample-act"]);

    expect(toggleFollow("sample-act")).toBe(false);
    expect(loadFollowed()).toEqual([]);

    window.localStorage.setItem("appear:followed", "{bad json");
    expect(loadFollowed()).toEqual([]);
  });

  it("surfaces missing AI configuration instead of a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "AI_NOT_CONFIGURED" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(apiAdapter.refresh("sample-act")).rejects.toEqual(
      new RefreshRequestError(
        "AI_NOT_CONFIGURED",
        "Live refresh isn’t configured."
      )
    );
  });

  it("posts a trimmed name and returns validated unverified initialization events", async () => {
    const discoveredEvent: Appearance = {
      ...timedEvent,
      id: "new-artist-live-2026-07-23",
      title: "New Artist Live",
      verificationStatus: "unverified",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [discoveredEvent] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiAdapter.initialize("  New Artist  ")).resolves.toEqual([
      discoveredEvent,
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Artist" }),
    });
  });

  it.each([
    ["BAD_REQUEST", "Enter a valid person name."],
    [
      "SEARCH_NOT_CONFIGURED",
      "Autonomous schedule search isn’t configured.",
    ],
    ["AI_NOT_CONFIGURED", "Autonomous schedule search isn’t configured."],
    [
      "NO_SOURCES_FOUND",
      "No verified or agent-discovered schedule could be found.",
    ],
    [
      "SOURCE_DISCOVERY_FAILED",
      "No verified or agent-discovered schedule could be found.",
    ],
    [
      "INFERENCE_FAILED",
      "No verified or agent-discovered schedule could be found.",
    ],
    [
      "INITIALIZATION_FAILED",
      "No verified or agent-discovered schedule could be found.",
    ],
  ] as const)(
    "maps initialization failure %s to a stable domain error",
    async (code, message) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ code, message: "Internal detail" }), {
            status: code === "BAD_REQUEST" ? 400 : 502,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await expect(apiAdapter.initialize("New Artist")).rejects.toEqual(
        new InitializationRequestError(code, message)
      );
    }
  );

  it("rejects initialization events that are malformed or marked verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ ...timedEvent, verificationStatus: "verified" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    await expect(apiAdapter.initialize("New Artist")).rejects.toEqual(
      new InitializationRequestError(
        "INITIALIZATION_FAILED",
        "No verified or agent-discovered schedule could be found."
      )
    );
  });

  it("formats checked time from an explicit clock", () => {
    const checked = new Date("2026-07-17T10:00:00Z");

    expect(formatRelativeTime(checked, new Date("2026-07-17T10:00:59Z"))).toBe(
      "just now"
    );
    expect(formatRelativeTime(checked, new Date("2026-07-17T10:01:00Z"))).toBe(
      "1 minute ago"
    );
    expect(formatRelativeTime(checked, new Date("2026-07-17T10:05:00Z"))).toBe(
      "5 minutes ago"
    );
  });
});
