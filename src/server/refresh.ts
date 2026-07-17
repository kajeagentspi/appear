import type { RefreshResult } from "@/contracts";
import { diffAppearances, normalizePersonId, sortAppearances } from "@/domain";
import { callInference } from "./provider";
import { getRefreshTarget, saveRefreshSuccess } from "./database";
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

  const raw = await callInference(target.sourceText);
  const verificationBySource = new Map(
    target.events.map((event) => [event.sourceUrl, event.verificationStatus])
  );
  const validated = sortAppearances(
    validateAppearances(raw).map((event) => ({
      ...event,
      verificationStatus:
        verificationBySource.get(event.sourceUrl) ?? "unverified",
    }))
  );
  const result = diffAppearances(target.events, validated);
  saveRefreshSuccess(id, result.events);
  return {
    events: result.events,
    changed: result.changed,
    message: result.changed ? "Updated just now" : "No changes",
  };
}

