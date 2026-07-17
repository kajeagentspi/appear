"use client";

import { Appearance } from "@/contracts";

interface EventCardProps {
  event: Appearance;
  selected: boolean;
  onSelect: () => void;
}

export function EventCard({ event, selected, onSelect }: EventCardProps) {
  const date = event.start ? new Date(event.start) : null;
  const month = date?.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "Asia/Tokyo",
  });
  const day = date
    ?.toLocaleDateString("en-US", { day: "numeric", timeZone: "Asia/Tokyo" })
    .padStart(2, "0");

  const meta = [event.venue, event.type].filter(Boolean).join(" · ");

  return (
    <li>
      <button
        type="button"
        className="event-card"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={`${event.title}, ${month ?? "TBA"} ${day ?? ""}, ${meta || "Details to be announced"}`}
      >
        <div className="event-date" aria-hidden="true">
          <span>{month ?? "TBA"}</span>
          <span className="event-date-day">{day ?? "—"}</span>
        </div>
        <div className="event-body">
          <p className="event-title">{event.title}</p>
          <p className="event-meta">{meta || "Details to be announced"}</p>
        </div>
      </button>
    </li>
  );
}
