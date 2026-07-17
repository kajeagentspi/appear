"use client";

import { FormEvent } from "react";

interface SearchBarProps {
  query: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function SearchBar({ query, onChange, onSubmit, disabled }: SearchBarProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} role="search" aria-label="Find a public schedule" aria-busy={disabled}>
      <label htmlFor="schedule-search" className="search-label">
        Find a public schedule
      </label>
      <div className="search-row">
        <input
          id="schedule-search"
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Artist or group name"
          disabled={disabled}
          aria-label="Search for a public schedule"
        />
        <button type="submit" className="search-button" disabled={disabled || query.trim().length === 0}>
          {disabled ? "Searching…" : "Search"}
        </button>
      </div>
    </form>
  );
}
