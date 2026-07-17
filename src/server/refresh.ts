import type { RefreshResult } from "@/contracts";
import { diffAppearances, normalizePersonId, sortAppearances } from "@/domain";
import { callKimi } from "./aiand";
import {
  getRefreshTarget,
  listDueRefreshPersonIds,
  recordRefreshFailure,
  saveRefreshSuccess,
} from "./database";
import { validateAppearances } from "./validate";

export class ScheduleNotFoundError extends Error {
  readonly code = "SCHEDULE_NOT_FOUND";
}

export class ScheduleSourceMissingError extends Error {
  readonly code = "SOURCE_NOT_CONFIGURED";
}

export async function refreshPersonSchedule(personId: string): Promise<RefreshResult> {
  const id = normalizePersonId(personId);
  const target = getRefreshTarget(id);
  if (!target) throw new ScheduleNotFoundError(`No schedule is registered for ${id}`);
  if (!target.sourceText) {
    throw new ScheduleSourceMissingError(`No source text is registered for ${id}`);
  }

  try {
    const raw = await callKimi(target.sourceText);
    const validated = sortAppearances(validateAppearances(raw));
    const result = diffAppearances(target.events, validated);
    saveRefreshSuccess(id, result.events);
    return {
      events: result.events,
      changed: result.changed,
      message: result.changed ? "Updated just now" : "No changes",
    };
  } catch (error) {
    recordRefreshFailure(id);
    throw error;
  }
}

export async function refreshDueSchedules(): Promise<
  Array<{ personId: string; refreshed: boolean }>
> {
  const results: Array<{ personId: string; refreshed: boolean }> = [];
  for (const personId of listDueRefreshPersonIds()) {
    try {
      await refreshPersonSchedule(personId);
      results.push({ personId, refreshed: true });
    } catch {
      results.push({ personId, refreshed: false });
    }
  }
  return results;
}
