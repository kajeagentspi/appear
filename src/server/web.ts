import { isIP } from "node:net";
import type { SearchCandidate, SourceDocument } from "@/contracts";

const JINA_SEARCH_ENDPOINT = "https://s.jina.ai/";
const JINA_READER_ENDPOINT = "https://r.jina.ai/";
const SEARCH_QUERIES = [
  (name: string) => `"${name}" official schedule tour dates public appearances`,
  (name: string) => `"${name}" 公式 スケジュール`,
  (name: string) => `"${name}" 공식 일정 스케줄`,
] as const;
const SEARCH_RESULTS_PER_QUERY = 10;
const MAX_SEARCH_CANDIDATES = 6;
const MAX_SOURCE_PAGES = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_SEARCH_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 100_000;
const MAX_CANDIDATE_TITLE_CHARS = 300;
const MAX_CANDIDATE_DESCRIPTION_CHARS = 160;

type SourceDiscoveryErrorCode =
  | "INVALID_SEARCH_QUERY"
  | "SEARCH_REQUEST_FAILED"
  | "SEARCH_RESPONSE_INVALID"
  | "UNSAFE_SOURCE_URL"
  | "SOURCE_FETCH_FAILED"
  | "SOURCE_RESPONSE_INVALID"
  | "SOURCE_RESPONSE_TOO_LARGE";

export class WebSearchConfigurationError extends Error {
  readonly code = "WEB_SEARCH_NOT_CONFIGURED";

  constructor() {
    super("JINA_KEY is required to discover and read official sources");
    this.name = "WebSearchConfigurationError";
  }
}

export class SourceDiscoveryError extends Error {
  constructor(
    readonly code: SourceDiscoveryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SourceDiscoveryError";
  }
}

function getJinaKey(): string {
  const apiKey = process.env.JINA_KEY?.trim();
  if (!apiKey) throw new WebSearchConfigurationError();
  return apiKey;
}

function normalizedPersonName(personName: string): string {
  const name = personName.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new SourceDiscoveryError(
      "INVALID_SEARCH_QUERY",
      "Person name must contain between 1 and 120 printable characters"
    );
  }
  return name.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

async function readResponseBody(
  response: Response,
  byteLimit: number,
  tooLargeCode: "SEARCH_RESPONSE_INVALID" | "SOURCE_RESPONSE_TOO_LARGE"
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > byteLimit) {
      throw new SourceDiscoveryError(tooLargeCode, "Response exceeded the allowed size");
    }
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > byteLimit) {
        await reader.cancel();
        throw new SourceDiscoveryError(tooLargeCode, "Response exceeded the allowed size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function ipv4IsPublic(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && octets[2] === 0) ||
    (a === 192 && b === 0 && octets[2] === 2) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88 && octets[2] === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  ) {
    return false;
  }
  return true;
}

function parseIpv6(address: string): number[] | null {
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const words: number[] = [];
    for (const part of half.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      words.push(Number.parseInt(part, 16));
    }
    return words;
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  return [...left, ...Array(missing).fill(0), ...right];
}

function ipv6IsPublic(address: string): boolean {
  const words = parseIpv6(address);
  if (!words) return false;
  const first = words[0];
  if ((first & 0xe000) !== 0x2000 || first === 0x2002) return false;
  if (
    first === 0x2001 &&
    (words[1] === 0 ||
      words[1] === 2 ||
      words[1] === 0x10 ||
      words[1] === 0x0db8)
  ) {
    return false;
  }
  return true;
}

function canonicalPublicHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";

    const rawHostname = url.hostname.toLowerCase();
    const hostname =
      rawHostname.startsWith("[") && rawHostname.endsWith("]")
        ? rawHostname.slice(1, -1)
        : rawHostname;
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;

    const family = isIP(hostname);
    if (
      (family === 4 && !ipv4IsPublic(hostname)) ||
      (family === 6 && !ipv6IsPublic(hostname))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function compactCandidateText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CANDIDATE_DESCRIPTION_CHARS);
}

function parseSearchCandidates(payload: unknown): SearchCandidate[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !Array.isArray(payload.data)
  ) {
    throw new SourceDiscoveryError(
      "SEARCH_RESPONSE_INVALID",
      "Jina Search returned an invalid result list"
    );
  }

  const candidates: SearchCandidate[] = [];
  for (const result of payload.data.slice(0, SEARCH_RESULTS_PER_QUERY)) {
    if (!result || typeof result !== "object" || !("url" in result)) continue;
    if (
      "httpStatus" in result &&
      typeof result.httpStatus === "number" &&
      result.httpStatus >= 400
    ) {
      continue;
    }

    const safeUrl =
      typeof result.url === "string"
        ? canonicalPublicHttpsUrl(result.url)
        : null;
    if (!safeUrl) continue;

    const title =
      "title" in result && typeof result.title === "string"
        ? result.title.trim().slice(0, MAX_CANDIDATE_TITLE_CHARS)
        : "";
    const description =
      "description" in result && typeof result.description === "string"
        ? compactCandidateText(result.description)
        : "";
    const content = "content" in result ? compactCandidateText(result.content) : "";

    candidates.push({
      url: safeUrl,
      title: title || new URL(safeUrl).hostname,
      description: description || content,
    });
  }
  return candidates;
}

async function runSearch(query: string, apiKey: string): Promise<SearchCandidate[]> {
  const endpoint = new URL(JINA_SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "AppearScheduleBot/1.0",
          "X-Max-Tokens": "3000",
          "X-Retain-Images": "none",
          "X-Retain-Media": "none",
        },
        signal: controller.signal,
      });
    } catch {
      throw new SourceDiscoveryError(
        "SEARCH_REQUEST_FAILED",
        "Jina Search request failed"
      );
    }

    if (!response.ok) {
      throw new SourceDiscoveryError(
        "SEARCH_REQUEST_FAILED",
        `Jina Search request failed with status ${response.status}`
      );
    }

    const body = await readResponseBody(
      response,
      MAX_SEARCH_RESPONSE_BYTES,
      "SEARCH_RESPONSE_INVALID"
    );
    try {
      return parseSearchCandidates(JSON.parse(body));
    } catch (error) {
      if (error instanceof SourceDiscoveryError) throw error;
      throw new SourceDiscoveryError(
        "SEARCH_RESPONSE_INVALID",
        "Jina Search returned malformed JSON"
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

function candidateQuality(candidate: SearchCandidate): number {
  const hasDescriptiveTitle = candidate.title !== new URL(candidate.url).hostname;
  return (hasDescriptiveTitle ? 10_000 : 0) + candidate.description.length;
}

function candidateRelevance(candidate: SearchCandidate): number {
  const url = new URL(candidate.url);
  const path = url.pathname.toLowerCase();
  const title = candidate.title.toLowerCase();
  const description = candidate.description.toLowerCase();
  const scheduleTerms =
    /schedule|calendar|events?|tour|live|appearances?|スケジュール|日程|予定|일정|스케줄|공연/i;
  const officialTerms = /official|公式|공식/i;
  const socialHost =
    /(^|\.)(x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com)$/i;
  const aggregatorHost =
    /(^|\.)(blip\.kr|fandom\.com|ticketmaster\.[a-z.]+|twicehub\.com|wikipedia\.org)$/i;

  let score = 0;
  if (scheduleTerms.test(path)) score += 1_000;
  if (officialTerms.test(title)) score += 400;
  if (scheduleTerms.test(title)) score += 250;
  if (officialTerms.test(description)) score += 120;
  if (scheduleTerms.test(description)) score += 80;
  if (socialHost.test(url.hostname) || /fan account/i.test(description)) score -= 800;
  if (aggregatorHost.test(url.hostname)) score -= 600;
  if (url.hostname.startsWith("shop.") || /\bofficial store\b/i.test(title)) {
    score -= 400;
  }
  return score;
}

export async function searchOfficialSourceCandidates(
  personName: string
): Promise<SearchCandidate[]> {
  const apiKey = getJinaKey();
  const name = normalizedPersonName(personName);
  const results = await Promise.allSettled(
    SEARCH_QUERIES.map((buildQuery) => runSearch(buildQuery(name), apiKey))
  );

  const successful = results.filter(
    (result): result is PromiseFulfilledResult<SearchCandidate[]> =>
      result.status === "fulfilled"
  );
  if (successful.length === 0) {
    throw (results[0] as PromiseRejectedResult).reason;
  }

  const unique = new Map<string, SearchCandidate>();
  for (const candidate of successful.flatMap((result) => result.value)) {
    const existing = unique.get(candidate.url);
    if (!existing) {
      unique.set(candidate.url, candidate);
    } else if (candidateQuality(candidate) > candidateQuality(existing)) {
      unique.set(candidate.url, candidate);
    }
  }
  const ranked = [...unique.values()].sort(
    (left, right) => candidateRelevance(right) - candidateRelevance(left)
  );
  return ranked.slice(0, MAX_SEARCH_CANDIDATES);
}

function parseSourceDocument(payload: unknown): SourceDocument | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("data" in payload) ||
    !payload.data ||
    typeof payload.data !== "object" ||
    !("url" in payload.data) ||
    !("content" in payload.data) ||
    typeof payload.data.url !== "string" ||
    typeof payload.data.content !== "string"
  ) {
    throw new SourceDiscoveryError(
      "SOURCE_RESPONSE_INVALID",
      "Jina Reader returned an invalid source document"
    );
  }

  if (
    "httpStatus" in payload.data &&
    typeof payload.data.httpStatus === "number" &&
    payload.data.httpStatus >= 400
  ) {
    throw new SourceDiscoveryError(
      "SOURCE_FETCH_FAILED",
      `Source page returned status ${payload.data.httpStatus}`
    );
  }

  const url = canonicalPublicHttpsUrl(payload.data.url);
  if (!url) {
    throw new SourceDiscoveryError(
      "UNSAFE_SOURCE_URL",
      "Jina Reader returned an unsafe source URL"
    );
  }

  const text = payload.data.content
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);
  return text ? { url, text } : null;
}

async function fetchSourceDocument(
  sourceUrl: string,
  apiKey: string
): Promise<SourceDocument | null> {
  const safeUrl = canonicalPublicHttpsUrl(sourceUrl);
  if (!safeUrl) {
    throw new SourceDiscoveryError(
      "UNSAFE_SOURCE_URL",
      "Source URL must be a public HTTPS URL"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(JINA_READER_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AppearScheduleBot/1.0",
          "X-Cache-Tolerance": "300",
          "X-Detach-Invisibles": "true",
          "X-Engine": "browser",
          "X-Max-Tokens": "30000",
          "X-Remove-Overlay": "true",
          "X-Respond-Timing": "resource-idle",
          "X-Retain-Images": "none",
          "X-Retain-Media": "none",
        },
        body: new URLSearchParams({ url: safeUrl }),
        signal: controller.signal,
      });
    } catch {
      throw new SourceDiscoveryError(
        "SOURCE_FETCH_FAILED",
        "Jina Reader request failed"
      );
    }

    if (!response.ok) {
      throw new SourceDiscoveryError(
        "SOURCE_FETCH_FAILED",
        `Jina Reader request failed with status ${response.status}`
      );
    }

    const body = await readResponseBody(
      response,
      MAX_SOURCE_RESPONSE_BYTES,
      "SOURCE_RESPONSE_TOO_LARGE"
    );
    try {
      return parseSourceDocument(JSON.parse(body));
    } catch (error) {
      if (error instanceof SourceDiscoveryError) throw error;
      throw new SourceDiscoveryError(
        "SOURCE_RESPONSE_INVALID",
        "Jina Reader returned malformed JSON"
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSourceDocuments(
  urls: string[]
): Promise<SourceDocument[]> {
  const apiKey = getJinaKey();
  const boundedUrls: string[] = [];
  const seen = new Set<string>();
  for (const value of urls) {
    const canonical = canonicalPublicHttpsUrl(value);
    const key = canonical ?? value;
    if (seen.has(key)) continue;
    seen.add(key);
    boundedUrls.push(value);
    if (boundedUrls.length === MAX_SOURCE_PAGES) break;
  }

  const results = await Promise.all(
    boundedUrls.map((url) => fetchSourceDocument(url, apiKey))
  );
  const documents = new Map<string, SourceDocument>();
  for (const document of results) {
    if (document && !documents.has(document.url)) {
      documents.set(document.url, document);
    }
  }
  return [...documents.values()];
}
