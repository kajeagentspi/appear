import { describe, expect, it } from "vitest";
import { validateAppearances, ValidationError } from "./validate";

const inference = {
  events: [
    {
      title: "  Example Hall appearance  ",
      type: " concert ",
      start: "2026-08-03T20:00:00-04:00",
      doors: null,
      venue: " Example Hall ",
      location: " New York, NY ",
      status: "SCHEDULED",
      sourceUrl: " https://artist.example/tour ",
    },
  ],
};

describe("validateAppearances", () => {
  it("marks initialization events unverified by default", () => {
    expect(validateAppearances(inference)).toEqual([
      {
        id: "1dj5x4u",
        title: "Example Hall appearance",
        type: "concert",
        start: "2026-08-03T20:00:00-04:00",
        doors: null,
        venue: "Example Hall",
        location: "New York, NY",
        status: "scheduled",
        sourceUrl: "https://artist.example/tour",
        verificationStatus: "unverified",
      },
    ]);
  });

  it("marks reviewed refresh events verified without changing deterministic IDs", () => {
    const initialized = validateAppearances(inference);
    const refreshed = validateAppearances(inference, "verified");

    expect(refreshed[0].verificationStatus).toBe("verified");
    expect(refreshed[0].id).toBe("1dj5x4u");
    expect(refreshed[0].id).toBe(initialized[0].id);
  });

  it("preserves validation of malformed event fields", () => {
    expect(() =>
      validateAppearances({
        events: [
          {
            ...inference.events[0],
            sourceUrl: "not-a-url",
          },
        ],
      })
    ).toThrow(ValidationError);

    expect(() =>
      validateAppearances({
        events: [
          {
            ...inference.events[0],
            start: "not-a-date",
          },
        ],
      })
    ).toThrow(ValidationError);
  });
});
