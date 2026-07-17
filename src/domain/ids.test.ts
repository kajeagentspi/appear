import { describe, expect, it } from "vitest";
import { createId } from "./ids";

describe("createId", () => {
  it("is deterministic for identical inputs", () => {
    const event = {
      title: "ILLIT GLITTER DAY IN JAPAN",
      start: "2026-07-23T18:00:00+09:00",
      venue: "Toyota Arena Tokyo",
    };
    expect(createId(event)).toBe(createId(event));
  });

  it("differentiates title, start, and venue", () => {
    const base = createId({
      title: "A",
      start: "2026-01-01T00:00:00+09:00",
      venue: "V",
    });

    expect(createId({ title: "B", start: "2026-01-01T00:00:00+09:00", venue: "V" })).not.toBe(
      base
    );
    expect(createId({ title: "A", start: "2026-01-02T00:00:00+09:00", venue: "V" })).not.toBe(
      base
    );
    expect(createId({ title: "A", start: "2026-01-01T00:00:00+09:00", venue: "W" })).not.toBe(
      base
    );
  });

  it("treats null values consistently", () => {
    const a = createId({ title: "A", start: null, venue: null });
    const b = createId({ title: "A", start: null, venue: null });
    expect(a).toBe(b);
  });
});
