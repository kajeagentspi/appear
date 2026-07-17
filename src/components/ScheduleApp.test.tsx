import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appearance, RefreshResult, ScheduleAdapter } from "@/contracts";
import { ScheduleApp } from "./ScheduleApp";

const baseEvents: Appearance[] = [
  {
    id: "illit-2026-07-23",
    title: "ILLIT GLITTER DAY IN JAPAN",
    type: "Concert",
    start: "2026-07-23T18:00:00+09:00",
    doors: "2026-07-23T17:00:00+09:00",
    venue: "Toyota Arena Tokyo",
    location: "Tokyo, Japan",
    status: "scheduled",
    sourceUrl: "https://illit-official.jp/schedule/448882bcd3c1",
  },
  {
    id: "illit-2026-07-25",
    title: "ILLIT GLITTER DAY IN JAPAN",
    type: "Concert",
    start: "2026-07-25T17:30:00+09:00",
    doors: "2026-07-25T16:00:00+09:00",
    venue: "Toyota Arena Tokyo",
    location: "Tokyo, Japan",
    status: "scheduled",
    sourceUrl: "https://illit-official.jp/schedule/448882bcd3c1",
  },
  {
    id: "illit-2026-07-26",
    title: "ILLIT GLITTER DAY IN JAPAN",
    type: "Concert",
    start: "2026-07-26T16:30:00+09:00",
    doors: "2026-07-26T15:00:00+09:00",
    venue: "Toyota Arena Tokyo",
    location: "Tokyo, Japan",
    status: "scheduled",
    sourceUrl: "https://illit-official.jp/schedule/448882bcd3c1",
  },
  {
    id: "illit-2026-08-09",
    title: "LuckyFes ’26",
    type: "Festival",
    start: "2026-08-09",
    doors: null,
    venue: "Hitachi Seaside Park",
    location: "Ibaraki, Japan",
    status: "scheduled",
    sourceUrl: "https://illit-official.jp/schedule/a67dbfc0afb0",
  },
];


function cloneFixtures(): Appearance[] {
  return baseEvents.map((event) => ({ ...event }));
}

function makeAdapter(events = cloneFixtures()): ScheduleAdapter {
  return {
    load: vi.fn().mockResolvedValue(events),
    refresh: vi.fn().mockResolvedValue({
      events,
      changed: false,
      message: "No changes",
    }),
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ScheduleApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("selecting LuckyFes updates every selected-event detail", async () => {
    const user = userEvent.setup();
    render(<ScheduleApp adapter={makeAdapter()} initialPersonId="ILLIT" />);

    await user.click(await screen.findByRole("button", { name: /LuckyFes ’26/ }));

    const detail = screen.getByRole("article", { name: /Details for LuckyFes ’26/ });
    expect(within(detail).getByRole("heading", { name: "LuckyFes ’26" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Festival appearance");
    expect(detail).toHaveTextContent("Sunday, August 9");
    expect(detail).toHaveTextContent("Artist time to be announced");
    expect(detail).toHaveTextContent("Hitachi Seaside Park");
    expect(detail).toHaveTextContent("Ibaraki, Japan");
    expect(detail).toHaveTextContent("Verified details");
    expect(within(detail).getByRole("link", { name: "View source" })).toHaveAttribute(
      "href",
      "https://illit-official.jp/schedule/a67dbfc0afb0"
    );
    expect(detail).toHaveTextContent("Checked just now");
    const calendarLink = within(detail).getByRole("link", {
      name: "Add to Google Calendar",
    });
    expect(calendarLink).toHaveAttribute("target", "_blank");
    expect(new URL(calendarLink.getAttribute("href")!).origin).toBe(
      "https://calendar.google.com"
    );
  });

  it("normalizes a search and renders a stored person’s schedule", async () => {
    const load = vi.fn().mockResolvedValue(cloneFixtures());
    const adapter: ScheduleAdapter = {
      load,
      refresh: vi.fn(),
    };
    render(<ScheduleApp adapter={adapter} initialPersonId={null} />);
    const input = screen.getByLabelText("Search for a public schedule");

    fireEvent.change(input, { target: { value: "  LE SSERAFIM  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("heading", { name: "LE SSERAFIM" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("le-sserafim");
  });

  it("shows a not-found result without starting a new-person pull", async () => {
    const adapter: ScheduleAdapter = {
      load: vi.fn().mockResolvedValue([]),
      refresh: vi.fn(),
    };
    render(<ScheduleApp adapter={adapter} initialPersonId={null} />);
    const input = screen.getByLabelText("Search for a public schedule");

    fireEvent.change(input, { target: { value: "  New Artist  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("We don’t track “New Artist” yet.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Find their schedule" })
    ).not.toBeInTheDocument();
  });

  it("persists follow state across a remount", async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter();
    const first = render(<ScheduleApp adapter={adapter} initialPersonId="ILLIT" />);

    const follow = await screen.findByRole("button", { name: "Follow ILLIT" });
    await user.click(follow);
    expect(screen.getByRole("button", { name: "Unfollow ILLIT" })).toHaveTextContent(
      "Following"
    );

    first.unmount();
    render(<ScheduleApp adapter={adapter} initialPersonId="ILLIT" />);
    expect(await screen.findByRole("button", { name: "Unfollow ILLIT" })).toHaveTextContent(
      "Following"
    );
  });

  it("advances the checked-relative time every minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00Z"));
    render(<ScheduleApp adapter={makeAdapter()} initialPersonId="ILLIT" />);
    await flushPromises();

    expect(screen.getByText("Checked just now")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText("Checked 1 minute ago")).toBeInTheDocument();
  });


  it("applies a manual time correction, updates checked time, enforces cooldown, and preserves events on failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00Z"));
    const corrected = cloneFixtures().map((event) =>
      event.start?.startsWith("2026-07-23")
        ? { ...event, start: "2026-07-23T18:30:00+09:00" }
        : event
    );
    let resolveRefresh: ((result: RefreshResult) => void) | undefined;
    const refresh = vi
      .fn<ScheduleAdapter["refresh"]>()
      .mockImplementationOnce(
        () =>
          new Promise<RefreshResult>((resolve) => {
            resolveRefresh = resolve;
          })
      );
    const adapter: ScheduleAdapter = {
      load: vi.fn().mockResolvedValue(cloneFixtures()),
      refresh,
    };
    render(<ScheduleApp adapter={adapter} initialPersonId="ILLIT" />);
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText("Checked 1 minute ago")).toBeInTheDocument();
    expect(screen.getByText("Doors 17:00 · Starts 18:00 JST")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Checking…")).toBeInTheDocument();

    await act(async () => {
      resolveRefresh?.({
        events: corrected,
        changed: true,
        message: "Updated just now",
      });
      await Promise.resolve();
    });
    expect(screen.getByText("Doors 17:00 · Starts 18:30 JST")).toBeInTheDocument();
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
    expect(screen.getByText("Checked just now")).toBeInTheDocument();

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    expect(refreshButton).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(refreshButton).toBeEnabled();

    refresh.mockRejectedValueOnce(new Error("provider unavailable"));
    fireEvent.click(refreshButton);
    await flushPromises();

    expect(screen.getByText("Update failed. Tap Refresh to try again.")).toBeInTheDocument();
    expect(screen.getByText("Doors 17:00 · Starts 18:30 JST")).toBeInTheDocument();
  });
});
