"use client";

import { Appearance } from "@/contracts";
import { EventCard } from "./EventCard";

interface EventListProps {
  events: Appearance[];
  selectedId: string | null;
  onSelect: (event: Appearance) => void;
}

export function EventList({ events, selectedId, onSelect }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        <p>No upcoming appearances found.</p>
      </div>
    );
  }

  return (
    <section aria-label="Upcoming appearances">
      <div className="section-header">
        <div>
          <h2 className="section-title">Upcoming</h2>
          <p className="section-subtitle">Officially announced appearances only</p>
        </div>
        <span className="jst-pill" aria-label="Times shown in Japan Standard Time">
          JST
        </span>
      </div>
      <ul className="event-list" aria-label="Upcoming appearances">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            selected={event.id === selectedId}
            onSelect={() => onSelect(event)}
          />
        ))}
      </ul>
    </section>
  );
}
