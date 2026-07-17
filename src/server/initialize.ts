import type {
  Appearance,
  InitializeResult,
  SearchCandidate,
  SourceDocument,
} from "@/contracts";
import { normalizePersonId, sortAppearances } from "@/domain";
import {
  extractInitialAppearances,
  selectOfficialSourceUrls,
} from "./provider";
import {
  getStoredSchedule,
  initializeStoredSchedule,
  type StoredSchedule,
} from "./database";
import { validateAppearances, ValidationError } from "./validate";
import {
  fetchSourceDocuments,
  searchOfficialSourceCandidates,
} from "./web";

const MAX_PERSON_NAME_LENGTH = 120;
const MAX_SELECTED_SOURCE_URLS = 3;
const inFlightInitializations = new Map<string, Promise<InitializeResult>>();


export class InvalidPersonNameError extends Error {
  readonly code = "BAD_REQUEST";
}

export class NoSourcesFoundError extends Error {
  readonly code = "NO_SOURCES_FOUND";
}

export async function initializePersonSchedule(
  name: string
): Promise<InitializeResult> {
  const { personId, displayName } = normalizeAndValidateName(name);
  const existing = getStoredSchedule(personId);
  if (existing) return toExistingResult(existing);

  const running = inFlightInitializations.get(personId);
  if (running) return running;

  const initialization = initializeNewSchedule(personId, displayName);
  inFlightInitializations.set(personId, initialization);
  try {
    return await initialization;
  } finally {
    if (inFlightInitializations.get(personId) === initialization) {
      inFlightInitializations.delete(personId);
    }
  }
}

async function initializeNewSchedule(
  personId: string,
  displayName: string
): Promise<InitializeResult> {
  const candidates = await searchOfficialSourceCandidates(displayName);
  if (candidates.length === 0) {
    throw new NoSourcesFoundError(`No defensible sources were found for ${displayName}`);
  }

  const selectedUrls = validateSelectedUrls(
    await selectOfficialSourceUrls(displayName, candidates),
    candidates
  );
  if (selectedUrls.length === 0) {
    throw new NoSourcesFoundError(`No defensible sources were found for ${displayName}`);
  }

  const documents = validateSourceDocuments(
    await fetchSourceDocuments(selectedUrls)
  );
  if (documents.length === 0) {
    throw new NoSourcesFoundError(`No defensible sources were found for ${displayName}`);
  }

  const rawEvents = await extractInitialAppearances(displayName, documents);
  const allowedSourceUrls = new Set(documents.map((document) => document.url));
  const events = sortAppearances(
    validateAppearances(rawEvents, "unverified").map((event, index) => {
      if (!allowedSourceUrls.has(event.sourceUrl)) {
        throw new ValidationError(
          `Event ${index} references a source that was not fetched`
        );
      }
      return { ...event, verificationStatus: "unverified" as const };
    })
  );
  if (events.length === 0) {
    throw new NoSourcesFoundError(`No defensible events were found for ${displayName}`);
  }

  const schedule = initializeStoredSchedule({
    personId,
    displayName,
    sources: documents.map((document) => ({
      url: document.url,
      sourceText: document.text,
      verificationStatus: "unverified" as const,
    })),
    events,
  });

  return {
    personId: schedule.personId,
    displayName: schedule.displayName,
    events: schedule.events,
    sourceUrls: documents.map((document) => document.url),
    verificationStatus: "unverified",
  };
}

function normalizeAndValidateName(name: string): {
  personId: string;
  displayName: string;
} {
  if (typeof name !== "string") {
    throw new InvalidPersonNameError("A person name is required");
  }

  const displayName = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const personId = normalizePersonId(displayName);
  if (
    !displayName ||
    displayName.length > MAX_PERSON_NAME_LENGTH ||
    !personId ||
    /[\p{Cc}\p{Cf}]/u.test(displayName)
  ) {
    throw new InvalidPersonNameError("Invalid person name");
  }

  return { personId, displayName };
}

function validateSelectedUrls(
  selectedUrls: string[],
  candidates: SearchCandidate[]
): string[] {
  if (
    !Array.isArray(selectedUrls) ||
    selectedUrls.length > MAX_SELECTED_SOURCE_URLS
  ) {
    throw new ValidationError("Expected selected source URLs");
  }

  const candidateUrls = new Set(candidates.map((candidate) => candidate.url));
  const uniqueUrls = new Set<string>();
  for (const url of selectedUrls) {
    if (typeof url !== "string" || !candidateUrls.has(url)) {
      throw new ValidationError("Selected source URL was not a search candidate");
    }
    uniqueUrls.add(url);
  }
  return [...uniqueUrls].sort();
}

function validateSourceDocuments(documents: SourceDocument[]): SourceDocument[] {
  if (!Array.isArray(documents)) {
    throw new ValidationError("Expected fetched source documents");
  }

  const byCanonicalUrl = new Map<string, SourceDocument>();
  for (const document of documents) {
    if (
      typeof document !== "object" ||
      document === null ||
      typeof document.url !== "string" ||
      !/^https:\/\//i.test(document.url) ||
      typeof document.text !== "string" ||
      !document.text.trim()
    ) {
      continue;
    }
    if (!byCanonicalUrl.has(document.url)) {
      byCanonicalUrl.set(document.url, {
        url: document.url,
        text: document.text,
      });
    }
  }

  return [...byCanonicalUrl.values()].sort((left, right) =>
    left.url.localeCompare(right.url)
  );
}

function toExistingResult(schedule: StoredSchedule): InitializeResult {
  return {
    personId: schedule.personId,
    displayName: schedule.displayName,
    events: schedule.events,
    sourceUrls: [
      ...new Set(schedule.events.map((event: Appearance) => event.sourceUrl)),
    ].sort(),
    verificationStatus: schedule.events.every(
      (event) => event.verificationStatus === "verified"
    )
      ? "verified"
      : "unverified",
  };
}
