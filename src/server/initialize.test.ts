import { beforeEach, describe, expect, it, vi } from "vitest";

const collaborators = vi.hoisted(() => ({
  getStoredSchedule: vi.fn(),
  initializeStoredSchedule: vi.fn(),
  search: vi.fn(),
  fetch: vi.fn(),
  select: vi.fn(),
  extract: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("./database", () => ({
  getStoredSchedule: collaborators.getStoredSchedule,
  initializeStoredSchedule: collaborators.initializeStoredSchedule,
}));

vi.mock("./web", () => ({
  searchOfficialSourceCandidates: collaborators.search,
  fetchSourceDocuments: collaborators.fetch,
}));

vi.mock("./aiand", () => ({
  selectOfficialSourceUrls: collaborators.select,
  extractInitialAppearances: collaborators.extract,
}));

vi.mock("./validate", () => {
  class ValidationError extends Error {
    readonly code = "INFERENCE_FAILED";
  }
  return {
    validateAppearances: collaborators.validate,
    ValidationError,
  };
});

import {
  initializePersonSchedule,
  InvalidPersonNameError,
  NoSourcesFoundError,
} from "./initialize";
import { ValidationError } from "./validate";

const candidates = [
  {
    url: "https://official.example/schedule",
    title: "Official schedule",
    description: "Upcoming appearances",
  },
];
const documents = [
  {
    url: "https://official.example/schedule/",
    text: "Official schedule source text",
  },
];
const laterEvent = {
  id: "later",
  title: "Second show",
  type: "Concert",
  start: "2026-09-02T20:00:00Z",
  doors: null,
  venue: "Arena",
  location: "Seoul",
  status: "scheduled" as const,
  sourceUrl: documents[0].url,
  verificationStatus: "verified" as const,
};
const earlierEvent = {
  ...laterEvent,
  id: "earlier",
  title: "First show",
  start: "2026-08-01T20:00:00Z",
};

function arrangeSuccessfulInitialization() {
  collaborators.getStoredSchedule.mockReturnValue(null);
  collaborators.search.mockResolvedValue(candidates);
  collaborators.select.mockResolvedValue([candidates[0].url]);
  collaborators.fetch.mockResolvedValue(documents);
  collaborators.extract.mockResolvedValue({ events: [] });
  collaborators.validate.mockReturnValue([laterEvent, earlierEvent]);
  collaborators.initializeStoredSchedule.mockImplementation((input) => ({
    personId: input.personId,
    displayName: input.displayName,
    status: "active",
    lastCheckedAt: null,
    events: input.events,
  }));
}

describe("initializePersonSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    arrangeSuccessfulInitialization();
  });

  it("runs the bounded workflow, sorts events, and persists only unverified data", async () => {
    const result = await initializePersonSchedule("  Ｎｅｗ   Artist  ");

    expect(collaborators.getStoredSchedule).toHaveBeenCalledWith("new-artist");
    expect(collaborators.search).toHaveBeenCalledWith("New Artist");
    expect(collaborators.select).toHaveBeenCalledWith("New Artist", candidates);
    expect(collaborators.fetch).toHaveBeenCalledWith([candidates[0].url]);
    expect(collaborators.extract).toHaveBeenCalledWith("New Artist", documents);
    expect(collaborators.validate).toHaveBeenCalledWith({ events: [] }, "unverified");
    expect(collaborators.initializeStoredSchedule).toHaveBeenCalledTimes(1);

    const write = collaborators.initializeStoredSchedule.mock.calls[0][0];
    expect(write).toMatchObject({
      personId: "new-artist",
      displayName: "New Artist",
      sources: [
        {
          url: documents[0].url,
          sourceText: documents[0].text,
          verificationStatus: "unverified",
        },
      ],
    });
    expect(write.events.map((event: typeof laterEvent) => event.id)).toEqual([
      "earlier",
      "later",
    ]);
    expect(write.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ verificationStatus: "unverified" }),
      ])
    );
    expect(result).toMatchObject({
      personId: "new-artist",
      displayName: "New Artist",
      sourceUrls: [documents[0].url],
      verificationStatus: "unverified",
    });
    expect(result.events.every((event) => event.verificationStatus === "unverified")).toBe(
      true
    );
  });

  it("coalesces concurrent initialization requests for the same person", async () => {
    let resolveSearch!: (value: typeof candidates) => void;
    collaborators.search.mockImplementation(
      () =>
        new Promise<typeof candidates>((resolve) => {
          resolveSearch = resolve;
        })
    );

    const first = initializePersonSchedule("New Artist");
    const second = initializePersonSchedule("  New   Artist  ");
    await Promise.resolve();

    expect(collaborators.search).toHaveBeenCalledTimes(1);
    resolveSearch(candidates);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toEqual(firstResult);
    expect(collaborators.initializeStoredSchedule).toHaveBeenCalledTimes(1);
  });

  it("returns an existing schedule without invoking discovery or writing", async () => {
    const existing = {
      personId: "illit",
      displayName: "ILLIT",
      status: "active",
      lastCheckedAt: null,
      events: [{ ...earlierEvent, verificationStatus: "verified" as const }],
    };
    collaborators.getStoredSchedule.mockReturnValue(existing);

    const result = await initializePersonSchedule("  ILLIT ");

    expect(result).toMatchObject({
      personId: "illit",
      displayName: "ILLIT",
      sourceUrls: [documents[0].url],
    });
    expect(result.events[0].verificationStatus).toBe("verified");
    expect(collaborators.search).not.toHaveBeenCalled();
    expect(collaborators.select).not.toHaveBeenCalled();
    expect(collaborators.fetch).not.toHaveBeenCalled();
    expect(collaborators.extract).not.toHaveBeenCalled();
    expect(collaborators.initializeStoredSchedule).not.toHaveBeenCalled();
  });

  it("rejects an event attributed to a URL outside the fetched canonical allowlist", async () => {
    collaborators.validate.mockReturnValue([
      { ...earlierEvent, sourceUrl: candidates[0].url },
    ]);

    await expect(initializePersonSchedule("New Artist")).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(collaborators.initializeStoredSchedule).not.toHaveBeenCalled();
  });

  it.each([
    ["no search candidates", () => collaborators.search.mockResolvedValue([])],
    ["no selected candidates", () => collaborators.select.mockResolvedValue([])],
    ["no fetched documents", () => collaborators.fetch.mockResolvedValue([])],
    ["no extracted events", () => collaborators.validate.mockReturnValue([])],
  ])("does not write when there are %s", async (_label, arrangeFailure) => {
    arrangeFailure();

    await expect(initializePersonSchedule("New Artist")).rejects.toBeInstanceOf(
      NoSourcesFoundError
    );
    expect(collaborators.initializeStoredSchedule).not.toHaveBeenCalled();
  });

  it("rejects a selected URL that was not discovered and never fetches it", async () => {
    collaborators.select.mockResolvedValue(["https://attacker.example/events"]);

    await expect(initializePersonSchedule("New Artist")).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(collaborators.fetch).not.toHaveBeenCalled();
    expect(collaborators.initializeStoredSchedule).not.toHaveBeenCalled();
  });

  it("rejects an over-broad source selection before fetching", async () => {
    collaborators.select.mockResolvedValue(Array(4).fill(candidates[0].url));

    await expect(initializePersonSchedule("New Artist")).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(collaborators.fetch).not.toHaveBeenCalled();
    expect(collaborators.initializeStoredSchedule).not.toHaveBeenCalled();
  });

  it.each(["   ", "---", `Artist\u0000Name`, "x".repeat(121)])(
    "rejects invalid name %j before calling collaborators",
    async (name) => {
      await expect(initializePersonSchedule(name)).rejects.toBeInstanceOf(
        InvalidPersonNameError
      );
      expect(collaborators.getStoredSchedule).not.toHaveBeenCalled();
      expect(collaborators.search).not.toHaveBeenCalled();
      expect(collaborators.initializeStoredSchedule).not.toHaveBeenCalled();
    }
  );
});
