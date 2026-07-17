"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Appearance, RefreshState, ScheduleAdapter } from "@/contracts";
import {
  apiAdapter,
  RefreshRequestError,
  normalizePersonId,
  registerPendingWatch,
  sortAppearances,
  loadFollowed,
  saveFollowed,
  loadPendingWatches,
  savePendingWatches,
} from "@/domain";
import { SearchBar } from "./SearchBar";
import { PersonHeader } from "./PersonHeader";
import { EventList } from "./EventList";
import { EventDetail } from "./EventDetail";

type WatchRegistrar = (name: string) => Promise<void>;

interface ScheduleAppProps {
  adapter?: ScheduleAdapter;
  initialPersonId?: string | null;
  watchRegistrar?: WatchRegistrar;
}

const AUTO_REFRESH_MS = 15 * 60 * 1000;
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
const MINUTE_MS = 60 * 1000;
const PENDING_SEARCH_DELAY_MS = 1500;

export function ScheduleApp({
  adapter = apiAdapter,
  initialPersonId = null,
  watchRegistrar = registerPendingWatch,
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);
  const [pendingWatches, setPendingWatches] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [searchingPending, setSearchingPending] = useState(false);
  const [pendingWatchError, setPendingWatchError] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshMessage, setRefreshMessage] = useState("Appearance date confirmed");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [manualCoolingDown, setManualCoolingDown] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const pendingTimer = useRef<number | null>(null);
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => {
    setFollowed(loadFollowed());
    setPendingWatches(loadPendingWatches());
    setStorageReady(true);
    const minuteTimer = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => {
      window.clearInterval(minuteTimer);
      window.clearTimeout(pendingTimer.current ?? undefined);
      window.clearTimeout(cooldownTimer.current ?? undefined);
    };
  }, []);

  useEffect(() => {
    if (storageReady) saveFollowed(followed);
  }, [followed, storageReady]);

  useEffect(() => {
    if (storageReady) savePendingWatches(pendingWatches);
  }, [pendingWatches, storageReady]);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    setSearchingPending(false);

    adapter
      .load(personId)
      .then((loaded) => {
        if (cancelled) return;
        const sorted = sortAppearances(loaded);
        setEvents(sorted);
        setSelectedId(sorted[0]?.id ?? null);
        if (sorted.length === 0) {
          setSearchError(`We don’t track “${searchedName}” yet.`);
          return;
        }
        setLastCheckedAt(new Date());
        setRefreshState("idle");
        setRefreshMessage("Appearance date confirmed");
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setSelectedId(null);
        setSearchError(`We don’t track “${searchedName}” yet.`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

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

  const performRefreshRef = useRef(performRefresh);
  useEffect(() => {
    performRefreshRef.current = performRefresh;
  }, [performRefresh]);

  useEffect(() => {
    if (!personId || events.length === 0) return;
    const timer = window.setInterval(
      () => performRefreshRef.current(personId, false),
      AUTO_REFRESH_MS
    );
    return () => window.clearInterval(timer);
  }, [events.length, personId]);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const normalized = normalizePersonId(trimmed);
    setActiveView("upcoming");
    setSearchedName(trimmed);
    setPersonId(normalized);
  }, [query]);

  const handleFindSchedule = useCallback(() => {
    if (!personId) return;
    setSearchingPending(true);
    setPendingWatchError(null);
    window.clearTimeout(pendingTimer.current ?? undefined);
    pendingTimer.current = window.setTimeout(() => {
      watchRegistrar(searchedName)
        .then(() => {
          setPendingWatches((previous) =>
            previous.includes(personId) ? previous : [...previous, personId]
          );
        })
        .catch(() => setPendingWatchError("Couldn’t start watching. Try again."))
        .finally(() => {
          setSearchingPending(false);
          pendingTimer.current = null;
        });
    }, PENDING_SEARCH_DELAY_MS);
  }, [personId, searchedName, watchRegistrar]);

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
  const isPending = personId ? pendingWatches.includes(personId) : false;
  const displayName = searchedName;
  const pendingMessage = searchingPending
    ? "Searching trusted sources…"
    : pendingWatchError ??
      (isPending ? "No verified schedule found. We’ll keep watching." : null);

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

          {personId && searchError && !loading && (
            <div className="empty-state" role="status" aria-live="polite">
              <p>{searchError}</p>
              {!isPending && !searchingPending && (
                <button type="button" className="pending-button" onClick={handleFindSchedule}>
                  Find their schedule
                </button>
              )}
              {pendingMessage && <p className="detail-checked">{pendingMessage}</p>}
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
