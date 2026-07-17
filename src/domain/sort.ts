import type { Appearance } from "@/contracts";

export function sortAppearances(events: Appearance[]): Appearance[] {
  return [...events].sort((a, b) => {
    const left = sortableTimestamp(a.start);
    const right = sortableTimestamp(b.start);
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });
}

function sortableTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}
