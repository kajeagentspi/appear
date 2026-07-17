import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import {
  fetchSourceDocuments,
  searchOfficialSourceCandidates,
  SourceDiscoveryError,
  WebSearchConfigurationError,
} from "./web";

const dnsState = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: dnsState.lookup },
  lookup: dnsState.lookup,
}));

const lookupMock = vi.mocked(lookup);
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function publicDns() {
  lookupMock.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ] as never);
}

describe("searchOfficialSourceCandidates", () => {
  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = "brave-test-key";
    fetchMock.mockReset();
    lookupMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.BRAVE_SEARCH_API_KEY;
  });

  it("runs only the bounded official-source queries and deduplicates HTTPS candidates", async () => {
    const repeated = {
      url: "https://artist.example/schedule#dates",
      title: "Official dates",
      description: "Tour schedule",
    };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          web: {
            results: [
              repeated,
              { url: "http://artist.example/insecure", title: "HTTP", description: "" },
              { url: "https://one.example/", title: "One", description: " First " },
              { url: "https://two.example/", title: "Two", description: "Second" },
              { url: "https://three.example/", title: "Three", description: "Third" },
              { url: "https://ignored.example/", title: "Over per-query limit", description: "" },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          web: {
            results: [
              { ...repeated, url: "https://artist.example/schedule" },
              { url: "https://four.example/", title: "Four", description: "Fourth" },
            ],
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ web: { results: [repeated] } }));

    const candidates = await searchOfficialSourceCandidates("  Example   Artist  ");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [request, init] of fetchMock.mock.calls) {
      const url = new URL(request.toString());
      expect(url.origin + url.pathname).toBe(
        "https://api.search.brave.com/res/v1/web/search"
      );
      expect(url.searchParams.get("count")).toBe("5");
      expect(url.searchParams.get("q")).toContain('"Example Artist"');
      expect(new Headers(init?.headers).get("X-Subscription-Token")).toBe(
        "brave-test-key"
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(candidates).toEqual([
      {
        url: "https://artist.example/schedule",
        title: "Official dates",
        description: "Tour schedule",
      },
      { url: "https://one.example/", title: "One", description: "First" },
      { url: "https://two.example/", title: "Two", description: "Second" },
      { url: "https://three.example/", title: "Three", description: "Third" },
      { url: "https://four.example/", title: "Four", description: "Fourth" },
    ]);
  });

  it("maps a missing key to WebSearchConfigurationError without making a request", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;

    await expect(searchOfficialSourceCandidates("Example Artist")).rejects.toMatchObject({
      name: "WebSearchConfigurationError",
      code: "WEB_SEARCH_NOT_CONFIGURED",
    });
    await expect(searchOfficialSourceCandidates("Example Artist")).rejects.toBeInstanceOf(
      WebSearchConfigurationError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts all search requests at the request timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_request, init) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      );
      return promise;
    });

    const rejection = expect(
      searchOfficialSourceCandidates("Example Artist")
    ).rejects.toMatchObject({ code: "SEARCH_REQUEST_FAILED" });
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("fetchSourceDocuments", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    lookupMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    publicDns();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("extracts compact readable text from HTML and discards empty pages", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          `<!doctype html><html><head><style>.hidden{display:none}</style><script>steal()</script></head>
           <body><h1>Official &amp; Live</h1><p>July&nbsp;20 &mdash; New York</p><br>Doors &#x36; PM</body></html>`,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(" <html><script>onlyHidden()</script> </html> ", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );

    const documents = await fetchSourceDocuments([
      "https://artist.example/schedule",
      "https://artist.example/empty",
    ]);

    expect(documents).toEqual([
      {
        url: "https://artist.example/schedule",
        text: "Official & Live\nJuly 20 — New York\nDoors 6 PM",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("validates every redirect target before following it", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://internal.example/private" },
      })
    );

    await expect(
      fetchSourceDocuments(["https://artist.example/schedule"])
    ).rejects.toMatchObject({ code: "UNSAFE_SOURCE_URL" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a bounded safe redirect and reports the final source URL", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "/dates" } })
      )
      .mockResolvedValueOnce(
        new Response("Show date", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
      );

    await expect(
      fetchSourceDocuments(["https://artist.example/old"])
    ).resolves.toEqual([
      { url: "https://artist.example/dates", text: "Show date" },
    ]);
    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["private IPv4", "10.2.3.4"],
    ["loopback IPv4", "127.0.0.1"],
    ["link-local IPv4", "169.254.20.1"],
    ["reserved IPv4", "203.0.113.8"],
    ["unique-local IPv6", "fd00::1"],
    ["link-local IPv6", "fe80::1"],
    ["loopback IPv6", "::1"],
  ])("rejects a host resolving to %s", async (_label, address) => {
    lookupMock.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }] as never);

    await expect(
      fetchSourceDocuments(["https://artist.example/schedule"])
    ).rejects.toMatchObject({ code: "UNSAFE_SOURCE_URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds DNS resolution with the page timeout", async () => {
    vi.useFakeTimers();
    const { promise } = Promise.withResolvers<never>();
    lookupMock.mockReturnValue(promise);

    const rejection = expect(
      fetchSourceDocuments(["https://artist.example/schedule"])
    ).rejects.toMatchObject({ code: "SOURCE_FETCH_FAILED" });
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects credentials and localhost before DNS or fetch", async () => {
    await expect(
      fetchSourceDocuments(["https://user:secret@artist.example/schedule"])
    ).rejects.toBeInstanceOf(SourceDiscoveryError);
    await expect(
      fetchSourceDocuments(["https://localhost/schedule"])
    ).rejects.toMatchObject({
      code: "UNSAFE_SOURCE_URL",
    });
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-text content and oversized bodies", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );

    await expect(
      fetchSourceDocuments(["https://artist.example/file"])
    ).rejects.toMatchObject({ code: "SOURCE_CONTENT_TYPE_UNSUPPORTED" });

    fetchMock.mockResolvedValueOnce(
      new Response("small", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": String(512 * 1024 + 1),
        },
      })
    );
    await expect(
      fetchSourceDocuments(["https://artist.example/huge"])
    ).rejects.toMatchObject({ code: "SOURCE_RESPONSE_TOO_LARGE" });
  });

  it("deduplicates input URLs and never fetches more than five pages", async () => {
    fetchMock.mockImplementation((request) =>
      Promise.resolve(
        new Response(`Page ${request.toString()}`, {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
      )
    );
    const urls = [
      "https://one.example/",
      "https://one.example/#duplicate",
      "https://two.example/",
      "https://three.example/",
      "https://four.example/",
      "https://five.example/",
      "https://six.example/",
      "https://seven.example/",
    ];

    const documents = await fetchSourceDocuments(urls);

    expect(documents).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(lookupMock).toHaveBeenCalledTimes(5);
  });
});
