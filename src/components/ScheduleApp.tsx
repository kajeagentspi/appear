"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Appearance, RefreshState, ScheduleAdapter } from "@/contracts";
import {
  apiAdapter,
  RefreshRequestError,
  normalizePersonId,
  sortAppearances,
  loadFollowed,
  saveFollowed,
} from "@/domain";
import { SearchBar } from "./SearchBar";
import { PersonHeader } from "./PersonHeader";
import { EventList } from "./EventList";
import { EventDetail } from "./EventDetail";


interface ScheduleAppProps {
  adapter?: ScheduleAdapter;
  initialPersonId?: string | null;
}

const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function ScheduleApp({
  adapter = apiAdapter,
  initialPersonId = null,
}: ScheduleAppProps) {
  const initialId = initialPersonId ? normalizePersonId(initialPersonId) : null;
  const initialName = initialPersonId?.trim() ?? "";
  const [query, setQuery] = useState(initialName);
  const [personId, setPersonId] = useState<string | null>(initialId);
  const [searchedName, setSearchedName] = useState(initialName);
  const [activeView, setActiveView] = useState<"upcoming" | "following">("upcoming");
  const [events, setEvents] = useState<Appearance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [initializing, setInitializing] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshMessage, setRefreshMessage] = useState("Appearance date confirmed");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [manualCoolingDown, setManualCoolingDown] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => {
    setFollowed(loadFollowed());
    setStorageReady(true);
    const minuteTimer = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => {
      window.clearInterval(minuteTimer);
      window.clearTimeout(cooldownTimer.current ?? undefined);
    };
  }, []);

  useEffect(() => {
    if (storageReady) saveFollowed(followed);
  }, [followed, storageReady]);


  useEffect(() => {
    if (!personId) return;
    const targetPersonId = personId;
    let cancelled = false;
    let attemptedInitialization = false;
    setLoading(true);
    setInitializing(false);
    setSearchError(null);
    setEvents([]);
    setSelectedId(null);

    async function loadOrInitializeSchedule() {
      try {
        let loaded = await adapter.load(targetPersonId);
        if (cancelled) return;

        if (loaded.length === 0) {
          attemptedInitialization = true;
          setInitializing(true);
          loaded = await adapter.initialize(searchedName);
          if (cancelled) return;
        }

        const sorted = sortAppearances(loaded);
        if (sorted.length === 0) {
          throw new Error("No schedule events were returned");
        }
        setEvents(sorted);
        setSelectedId(sorted[0].id);
        setLastCheckedAt(new Date());
        setRefreshState("idle");
        setRefreshMessage(
          attemptedInitialization
            ? "Agent-discovered schedule loaded"
            : "Appearance date confirmed"
        );
      } catch {
        if (cancelled) return;
        setEvents([]);
        setSelectedId(null);
        setSearchError(
          attemptedInitialization
            ? "No verified or agent-discovered schedule could be found."
            : `We don’t track “${searchedName}” yet.`
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitializing(false);
        }
      }
    }

    void loadOrInitializeSchedule();

    return () => {
      cancelled = true;
    };
  }, [adapter, personId, searchedName]);

  const performRefresh = useCallback(
    async (targetPersonId: string, isManual: boolean) => {
      if (isManual && manualCoolingDown) return;
      setRefreshState("checking");
      try {
        const result = await adapter.refresh(targetPersonId);
        const sorted = sortAppearances(result.events);
        setEvents(sorted);
        setSelectedId((previous) =>
          sorted.some((event) => event.id === previous)
            ? previous
            : sorted[0]?.id ?? null
        );
        setLastCheckedAt(new Date());
        setRefreshState("idle");
        setRefreshMessage(result.changed ? "Updated just now" : "No changes");

        if (isManual) {
          setManualCoolingDown(true);
          window.clearTimeout(cooldownTimer.current ?? undefined);
          cooldownTimer.current = window.setTimeout(() => {
            setManualCoolingDown(false);
            cooldownTimer.current = null;
          }, MANUAL_REFRESH_COOLDOWN_MS);
        }
      } catch (error) {
        setRefreshState("failed");
        setRefreshMessage(
          error instanceof RefreshRequestError
            ? error.message
            : "Update failed. Tap Refresh to try again."
        );
      }
    },
    [adapter, manualCoolingDown]
  );


  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const normalized = normalizePersonId(trimmed);
    setActiveView("upcoming");
    setEvents([]);
    setSelectedId(null);
    setSearchError(null);
    setInitializing(false);
    setLoading(true);
    setSearchedName(trimmed);
    setPersonId(normalized);
  }, [query]);


  const handleToggleFollow = useCallback(() => {
    if (!personId) return;
    setFollowed((previous) =>
      previous.includes(personId)
        ? previous.filter((id) => id !== personId)
        : [...previous, personId]
    );
  }, [personId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? events[0] ?? null,
    [events, selectedId]
  );
  const isFollowing = personId ? followed.includes(personId) : false;
  const displayName = searchedName;

  function openFollowingPerson(id: string) {
    setQuery(id);
    setSearchedName(id);
    setPersonId(id);
    setActiveView("upcoming");
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="brand">APPEAR</h1>
          <p className="tagline">Be there when they are.</p>
        </div>
        <nav className="tabs" aria-label="Schedule views">
          <button
            type="button"
            className="tab"
            aria-pressed={activeView === "upcoming"}
            onClick={() => setActiveView("upcoming")}
          >
            Upcoming
          </button>
          <button
            type="button"
            className="tab"
            aria-pressed={activeView === "following"}
            onClick={() => setActiveView("following")}
          >
            Following
          </button>
        </nav>
      </header>

      {activeView === "following" ? (
        <section className="following-view" aria-labelledby="following-title">
          <h2 id="following-title" className="section-title">Following</h2>
          {followed.length === 0 ? (
            <p className="section-subtitle">Follow an artist to keep their schedule close.</p>
          ) : (
            <ul className="following-list">
              {followed.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => openFollowingPerson(id)}>
                    <strong>{id}</strong>
                    <span>Open schedule</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <SearchBar
            query={query}
            onChange={setQuery}
            onSubmit={handleSearch}
            disabled={loading}
          />

          {personId && !searchError && events.length > 0 && (
            <PersonHeader
              displayName={displayName}
              eventCount={events.length}
              following={isFollowing}
              onToggleFollow={handleToggleFollow}
            />
          )}

          {personId && loading && initializing && (
            <div
              className="empty-state"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <p>Searching official sources…</p>
            </div>
          )}

          {personId && searchError && !loading && (
            <div className="empty-state" role="status" aria-live="polite">
              <p>{searchError}</p>
            </div>
          )}

          {personId && !searchError && events.length > 0 && (
            <div className="main">
              <EventList
                events={events}
                selectedId={selectedId}
                onSelect={(event) => setSelectedId(event.id)}
              />
              {selectedEvent && (
                <EventDetail
                  event={selectedEvent}
                  refreshState={refreshState}
                  refreshMessage={refreshMessage}
                  checkedAt={lastCheckedAt}
                  now={now}
                  onRefresh={() => performRefresh(personId, true)}
                  canRefresh={!manualCoolingDown && refreshState !== "checking"}
                />
              )}
            </div>
          )}

          {!personId && (
            <div className="empty-state">
              <p>Search for an artist or group to see their upcoming public appearances.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
