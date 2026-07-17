"use client";

import { Appearance, RefreshState } from "@/contracts";
import { buildGoogleCalendarUrl, formatRelativeTime } from "@/domain";

interface EventDetailProps {
  event: Appearance;
  refreshState: RefreshState;
  refreshMessage: string;
  checkedAt: Date | null;
  now: Date;
  onRefresh: () => void;
  canRefresh: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function formatEventDate(start: string | null): string {
  if (!start) return "Date to be announced";
  return new Date(DATE_ONLY.test(start) ? `${start}T00:00:00+09:00` : start)
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Tokyo",
    });
}

function formatJstTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });
}

function formatTimeRange(doors: string | null, start: string | null): string {
  const parts: string[] = [];
  if (doors) parts.push(`Doors ${formatJstTime(doors)}`);
  if (start && !DATE_ONLY.test(start)) parts.push(`Starts ${formatJstTime(start)}`);
  return parts.length > 0 ? `${parts.join(" · ")} JST` : "Artist time to be announced";
}

export function EventDetail({
  event,
  refreshState,
  refreshMessage,
  checkedAt,
  now,
  onRefresh,
  canRefresh,
}: EventDetailProps) {
  const checkedText = checkedAt
    ? `Checked ${formatRelativeTime(checkedAt, now)}`
    : "Not checked yet";
  let sourceHost = event.sourceUrl;
  try {
    sourceHost = new URL(event.sourceUrl).hostname;
  } catch {
    // Server validation protects stored data; keep the original value as a fallback.
  }


  const typeLabel =
    event.type?.toLowerCase() === "festival"
      ? "Festival appearance"
      : event.type ?? "Appearance";
  const isVerified = event.verificationStatus === "verified";
  const verificationLabel = isVerified ? "Verified" : "Unverified";

  return (
    <article className="detail-card" aria-label={`Details for ${event.title}`}>
      <header className="detail-header">
        <span className="detail-label">Next appearance</span>
        <span
          className="verification-pill"
          data-verification={event.verificationStatus}
        >
          {verificationLabel}
        </span>
      </header>

      <h2 className="detail-title">{event.title}</h2>
      <p className="detail-type">{typeLabel}</p>

      <div className="detail-datetime">
        <p className="detail-date">{formatEventDate(event.start)}</p>
        <p className="detail-time">{formatTimeRange(event.doors, event.start)}</p>
      </div>

      <div className="detail-block">
        <h3 className="detail-block-title">{event.venue ?? "Venue to be announced"}</h3>
        <p className="detail-block-text">{event.location ?? "Location to be announced"}</p>
      </div>

      <div className="detail-block">
        <h3 className="detail-block-title">
          {isVerified ? "Verified details" : "Agent-discovered details"}
        </h3>
        <p className="detail-block-text">
          {isVerified
            ? "Date, venue and appearance are supported by the official source."
            : "Agent-discovered information. Confirm details with the linked source before making plans."}
        </p>
      </div>

      <div className="detail-block" aria-live="polite">
        <h3 className="detail-block-title">
          {refreshState === "checking"
            ? "Checking…"
            : refreshMessage || "Appearance date confirmed"}
        </h3>
        <p className="detail-block-text">
          We will notify you if the time, venue or status changes.
        </p>
      </div>

      <div className="detail-source-row">
        <div className="detail-source">
          <strong>{sourceHost}</strong>
          <div className="detail-check-row">
            <span className="detail-checked">{checkedText}</span>
            <button
              type="button"
              className="refresh-link"
              onClick={onRefresh}
              disabled={!canRefresh || refreshState === "checking"}
            >
              Refresh
            </button>
          </div>
        </div>
        <a
          className="view-source"
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View source
        </a>
      </div>


      <a
        className="add-calendar-button"
        href={buildGoogleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Add to Google Calendar
      </a>
    </article>
  );
}
