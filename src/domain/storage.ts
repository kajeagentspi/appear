const FOLLOWED_KEY = "appear:followed";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStringArray(key: string): string[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean))];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, values: string[]): void {
  const storage = getStorage();
  if (!storage) return;
  const normalized = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  try {
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable or full; persistence must not break the UI.
  }
}

export function loadFollowed(): string[] {
  return readStringArray(FOLLOWED_KEY);
}

export function saveFollowed(ids: string[]): void {
  writeStringArray(FOLLOWED_KEY, ids);
}

export function isFollowed(id: string): boolean {
  return loadFollowed().includes(id.trim().toLowerCase());
}

export function toggleFollow(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  const ids = loadFollowed();
  const next = ids.includes(normalized)
    ? ids.filter((value) => value !== normalized)
    : [...ids, normalized];
  saveFollowed(next);
  return !ids.includes(normalized);
}

