import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SearchCandidate, SourceDocument } from "@/contracts";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const SEARCH_QUERIES = [
  (name: string) => `"${name}" official schedule`,
  (name: string) => `"${name}" official tour dates`,
  (name: string) => `"${name}" official appearances events`,
] as const;
const SEARCH_RESULTS_PER_QUERY = 5;
const MAX_SOURCE_PAGES = 5;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_SEARCH_RESPONSE_BYTES = 512 * 1024;
const MAX_SOURCE_RESPONSE_BYTES = 512 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 100_000;

type SourceDiscoveryErrorCode =
  | "INVALID_SEARCH_QUERY"
  | "SEARCH_REQUEST_FAILED"
  | "SEARCH_RESPONSE_INVALID"
  | "UNSAFE_SOURCE_URL"
  | "SOURCE_FETCH_FAILED"
  | "SOURCE_RESPONSE_TOO_LARGE"
  | "SOURCE_CONTENT_TYPE_UNSUPPORTED"
  | "SOURCE_REDIRECT_INVALID";

export class WebSearchConfigurationError extends Error {
  readonly code = "WEB_SEARCH_NOT_CONFIGURED";

  constructor() {
    super("BRAVE_SEARCH_API_KEY is required to discover official sources");
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

function normalizedPersonName(personName: string): string {
  const name = personName.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new SourceDiscoveryError(
      "INVALID_SEARCH_QUERY",
      "Person name must contain between 1 and 120 printable characters"
    );
  }
  return name;
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

function canonicalHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseSearchCandidates(payload: unknown): SearchCandidate[] {
  if (!payload || typeof payload !== "object") {
    throw new SourceDiscoveryError(
      "SEARCH_RESPONSE_INVALID",
      "Brave Search returned an invalid response"
    );
  }

  if (!(("web" in payload))) return [];
  const web = payload.web;
  if (
    !web ||
    typeof web !== "object" ||
    !("results" in web) ||
    !Array.isArray(web.results)
  ) {
    throw new SourceDiscoveryError(
      "SEARCH_RESPONSE_INVALID",
      "Brave Search returned an invalid web result list"
    );
  }

  const candidates: SearchCandidate[] = [];
  for (const result of web.results.slice(0, SEARCH_RESULTS_PER_QUERY)) {
    if (
      !result ||
      typeof result !== "object" ||
      !("url" in result) ||
      !("title" in result)
    ) {
      continue;
    }
    const { url, title } = result;
    const description = "description" in result ? result.description : undefined;
    if (typeof url !== "string" || typeof title !== "string") continue;
    const safeUrl = canonicalHttpsUrl(url);
    if (!safeUrl) continue;
    candidates.push({
      url: safeUrl,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
    });
  }
  return candidates;
}

async function runSearch(query: string, apiKey: string): Promise<SearchCandidate[]> {
  const endpoint = new URL(BRAVE_SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", String(SEARCH_RESULTS_PER_QUERY));
  endpoint.searchParams.set("safesearch", "moderate");
  endpoint.searchParams.set("text_decorations", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
        signal: controller.signal,
      });
    } catch {
      throw new SourceDiscoveryError(
        "SEARCH_REQUEST_FAILED",
        "Brave Search request failed"
      );
    }

    if (!response.ok) {
      throw new SourceDiscoveryError(
        "SEARCH_REQUEST_FAILED",
        `Brave Search request failed with status ${response.status}`
      );
    }

    const body = await readResponseBody(
      response,
      MAX_SEARCH_RESPONSE_BYTES,
      "SEARCH_RESPONSE_INVALID"
    );
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new SourceDiscoveryError(
        "SEARCH_RESPONSE_INVALID",
        "Brave Search returned malformed JSON"
      );
    }
    return parseSearchCandidates(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchOfficialSourceCandidates(
  personName: string
): Promise<SearchCandidate[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new WebSearchConfigurationError();

  const name = normalizedPersonName(personName);
  const resultSets = await Promise.all(
    SEARCH_QUERIES.map((buildQuery) => runSearch(buildQuery(name), apiKey))
  );
  const unique = new Map<string, SearchCandidate>();
  for (const candidate of resultSets.flat()) {
    if (!unique.has(candidate.url)) unique.set(candidate.url, candidate);
  }
  return [...unique.values()];
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
  const normalized = address.toLowerCase();
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const words: number[] = [];
    for (const part of half.split(":")) {
      const value = Number.parseInt(part, 16);
      if (!/^[0-9a-f]{1,4}$/.test(part) || !Number.isFinite(value)) return null;
      words.push(value);
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

  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2002) return false;
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

function addressIsPublic(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4IsPublic(address);
  if (family === 6) return ipv6IsPublic(address);
  return false;
}


async function assertSafeSourceUrl(
  value: string,
  signal: AbortSignal
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SourceDiscoveryError("UNSAFE_SOURCE_URL", "Source URL is invalid");
  }

  if (url.protocol !== "https:") {
    throw new SourceDiscoveryError(
      "UNSAFE_SOURCE_URL",
      "Source URL must use HTTPS"
    );
  }
  if (url.username || url.password) {
    throw new SourceDiscoveryError(
      "UNSAFE_SOURCE_URL",
      "Source URL must not contain credentials"
    );
  }
  url.hash = "";

  const rawHostname = url.hostname.toLowerCase();
  const hostname =
    rawHostname.startsWith("[") && rawHostname.endsWith("]")
      ? rawHostname.slice(1, -1)
      : rawHostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SourceDiscoveryError(
      "UNSAFE_SOURCE_URL",
      "Local source hosts are not allowed"
    );
  }

  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!addressIsPublic(hostname)) {
      throw new SourceDiscoveryError(
        "UNSAFE_SOURCE_URL",
        "Source host resolved to a non-public address"
      );
    }
    return url;
  }

  let rejectAbort!: (reason: SourceDiscoveryError) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const rejectOnAbort = () =>
    rejectAbort(
      new SourceDiscoveryError(
        "SOURCE_FETCH_FAILED",
        "Source host resolution timed out"
      )
    );
  signal.addEventListener("abort", rejectOnAbort, { once: true });
  if (signal.aborted) rejectOnAbort();

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      aborted,
    ]);
  } catch (error) {
    if (error instanceof SourceDiscoveryError) throw error;
    throw new SourceDiscoveryError(
      "SOURCE_FETCH_FAILED",
      "Source host could not be resolved"
    );
  } finally {
    signal.removeEventListener("abort", rejectOnAbort);
  }
  if (!addresses.length || addresses.some(({ address }) => !addressIsPublic(address))) {
    throw new SourceDiscoveryError(
      "UNSAFE_SOURCE_URL",
      "Source host resolved to a non-public address"
    );
  }
  return url;
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    mdash: "—",
    ndash: "–",
    nbsp: " ",
    quot: '"',
  };
  return text.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return named[name.toLowerCase()] ?? entity;
    const hex = name[1]?.toLowerCase() === "x";
    const value = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    try {
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : " ";
    } catch {
      return " ";
    }
  });
}

function htmlToReadableText(html: string): string {
  const withoutHiddenContent = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const withBreaks = withoutHiddenContent
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:address|article|aside|blockquote|div|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)\s*>/gi, "\n");
  return decodeHtmlEntities(withBreaks.replace(/<[^>]*>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

function plainTextToReadableText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

async function fetchSourceDocument(sourceUrl: string): Promise<SourceDocument | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let currentUrl = sourceUrl;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const safeUrl = await assertSafeSourceUrl(currentUrl, controller.signal);
      let response: Response;
      try {
        response = await fetch(safeUrl, {
          headers: {
            Accept: "text/html, text/plain;q=0.9, text/*;q=0.8",
            "User-Agent": "AppearScheduleBot/1.0",
          },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        throw new SourceDiscoveryError(
          "SOURCE_FETCH_FAILED",
          "Source page request failed"
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new SourceDiscoveryError(
            "SOURCE_REDIRECT_INVALID",
            "Source page returned an invalid redirect chain"
          );
        }
        try {
          currentUrl = new URL(location, safeUrl).toString();
        } catch {
          throw new SourceDiscoveryError(
            "SOURCE_REDIRECT_INVALID",
            "Source page returned an invalid redirect target"
          );
        }
        continue;
      }

      if (!response.ok) {
        throw new SourceDiscoveryError(
          "SOURCE_FETCH_FAILED",
          `Source page request failed with status ${response.status}`
        );
      }

      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      const isHtml =
        contentType === "text/html" || contentType === "application/xhtml+xml";
      const isText = contentType?.startsWith("text/") ?? false;
      if (!isHtml && !isText) {
        throw new SourceDiscoveryError(
          "SOURCE_CONTENT_TYPE_UNSUPPORTED",
          "Source page did not return HTML or text"
        );
      }

      const body = await readResponseBody(
        response,
        MAX_SOURCE_RESPONSE_BYTES,
        "SOURCE_RESPONSE_TOO_LARGE"
      );
      const text = isHtml ? htmlToReadableText(body) : plainTextToReadableText(body);
      return text ? { url: safeUrl.toString(), text } : null;
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new SourceDiscoveryError(
    "SOURCE_REDIRECT_INVALID",
    "Source page returned too many redirects"
  );
}

export async function fetchSourceDocuments(
  urls: string[]
): Promise<SourceDocument[]> {
  const boundedUrls: string[] = [];
  const seen = new Set<string>();
  for (const value of urls) {
    const canonical = canonicalHttpsUrl(value);
    const key = canonical ?? value;
    if (seen.has(key)) continue;
    seen.add(key);
    boundedUrls.push(value);
    if (boundedUrls.length === MAX_SOURCE_PAGES) break;
  }

  const documents: SourceDocument[] = [];
  for (const url of boundedUrls) {
    const document = await fetchSourceDocument(url);
    if (document) documents.push(document);
  }
  return documents;
}
