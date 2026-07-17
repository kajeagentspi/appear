import type { Appearance } from "@/contracts";
import { sortAppearances } from "./sort";

const FIELDS: (keyof Appearance)[] = [
  "id",
  "title",
  "type",
  "start",
  "doors",
  "venue",
  "location",
  "status",
  "sourceUrl",
];

export function diffAppearances(
  prev: Appearance[],
  next: Appearance[]
): { events: Appearance[]; changed: boolean } {
  const sortedNext = sortAppearances(next);
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const nextById = new Map(sortedNext.map((e) => [e.id, e]));

  let changed = prev.length !== sortedNext.length;

  for (const event of sortedNext) {
    const previous = prevById.get(event.id);
    if (!previous) {
      changed = true;
      continue;
    }
    for (const key of FIELDS) {
      if (previous[key] !== event[key]) {
        changed = true;
        break;
      }
    }
  }

  if (!changed) {
    for (const event of prev) {
      if (!nextById.has(event.id)) {
        changed = true;
        break;
      }
    }
  }

  return { events: sortedNext, changed };
}
