import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSourceDocuments,
  searchOfficialSourceCandidates,
  SourceDiscoveryError,
  WebSearchConfigurationError,
} from "./web";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function searchResponse(data: unknown[]): Response {
  return jsonResponse({ code: 200, status: 200, data });
}

function sourceResponse(url: string, content = "Official schedule text"): Response {
  return jsonResponse({
    code: 200,
    status: 200,
    data: { url, content, httpStatus: 200 },
  });
}

beforeEach(() => {
  process.env.JINA_KEY = "jina-test-key";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.JINA_KEY;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("searchOfficialSourceCandidates", () => {
  it("runs bounded English, Japanese, and Korean queries and finds localized official schedules", async () => {
    fetchMock
      .mockResolvedValueOnce(
        searchResponse([
          {
            url: "https://artist.example/schedule#dates",
            title: "",
            description: "",
            content: "# Official schedule\nJuly public appearances",
            httpStatus: 200,
          },
          {
            url: "http://artist.example/insecure",
            title: "Insecure",
            description: "",
          },
          {
            url: "https://failed.example/schedule",
            title: "Failed",
            description: "",
            httpStatus: 500,
          },
        ])
      )
      .mockResolvedValueOnce(
        searchResponse([
          {
            url: "https://www.le-sserafim.jp/schedule",
            title: "LE SSERAFIM OFFICIAL SITE",
            description: "公式スケジュール",
            content: "ignored because a description is present",
            httpStatus: 200,
          },
          {
            url: "https://artist.example/schedule",
            title: "Official schedule",
            description: "Longer official schedule description",
            httpStatus: 200,
          },
        ])
      )
      .mockResolvedValueOnce(
        searchResponse([
          {
            url: "https://artist.kr/schedule",
            title: "공식 일정",
            description: "",
            content: "공식 공연 일정",
            httpStatus: 200,
          },
        ])
      );

    const candidates = await searchOfficialSourceCandidates("  LE   SSERAFIM  ");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const queries = fetchMock.mock.calls.map(([request, init]) => {
      const url = new URL(request.toString());
      expect(url.origin + url.pathname).toBe("https://s.jina.ai/");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer jina-test-key");
      expect(headers.get("Accept")).toBe("application/json");
      expect(headers.get("User-Agent")).toBe("AppearScheduleBot/1.0");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return url.searchParams.get("q");
    });
    expect(queries).toEqual([
      '"LE SSERAFIM" official schedule tour dates public appearances',
      '"LE SSERAFIM" 公式 スケジュール',
      '"LE SSERAFIM" 공식 일정 스케줄',
    ]);
    expect(candidates).toHaveLength(3);
    expect(candidates).toEqual(
      expect.arrayContaining([
        {
          url: "https://artist.example/schedule",
          title: "Official schedule",
          description: "Longer official schedule description",
        },
        {
          url: "https://www.le-sserafim.jp/schedule",
          title: "LE SSERAFIM OFFICIAL SITE",
          description: "公式スケジュール",
        },
        {
          url: "https://artist.kr/schedule",
          title: "공식 일정",
          description: "공식 공연 일정",
        },
      ])
    );
    expect(
      candidates.findIndex(({ url }) => url === "https://www.le-sserafim.jp/schedule")
    ).toBeLessThan(3);
  });

  it("keeps successful localized results when another query fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("English search failed"))
      .mockResolvedValueOnce(
        searchResponse([
          {
            url: "https://artist.jp/schedule",
            title: "Official schedule",
            description: "",
          },
        ])
      )
      .mockResolvedValueOnce(searchResponse([]));

    await expect(
      searchOfficialSourceCandidates("Example Artist")
    ).resolves.toEqual([
      {
        url: "https://artist.jp/schedule",
        title: "Official schedule",
        description: "",
      },
    ]);
  });

  it("maps a missing key to WebSearchConfigurationError without making a request", async () => {
    delete process.env.JINA_KEY;

    await expect(
      searchOfficialSourceCandidates("Example Artist")
    ).rejects.toMatchObject({
      name: "WebSearchConfigurationError",
      code: "WEB_SEARCH_NOT_CONFIGURED",
    });
    await expect(
      searchOfficialSourceCandidates("Example Artist")
    ).rejects.toBeInstanceOf(WebSearchConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when every localized query returns malformed JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));

    await expect(
      searchOfficialSourceCandidates("Example Artist")
    ).rejects.toMatchObject({ code: "SEARCH_RESPONSE_INVALID" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("fetchSourceDocuments", () => {
  it("reads selected pages through Jina Reader browser rendering", async () => {
    fetchMock.mockResolvedValueOnce(
      sourceResponse(
        "https://artist.example/schedule#current",
        "# Schedule\r\n\r\nJuly 20 — Tokyo"
      )
    );

    const documents = await fetchSourceDocuments([
      "https://artist.example/schedule#search-result",
    ]);

    expect(documents).toEqual([
      {
        url: "https://artist.example/schedule",
        text: "# Schedule\n\nJuly 20 — Tokyo",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request, init] = fetchMock.mock.calls[0];
    expect(request).toBe("https://r.jina.ai/");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer jina-test-key");
    expect(headers.get("X-Engine")).toBe("browser");
    expect(headers.get("X-Remove-Overlay")).toBe("true");
    expect(headers.get("X-Detach-Invisibles")).toBe("true");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).get("url")).toBe(
      "https://artist.example/schedule"
    );
  });

  it("deduplicates and bounds Jina Reader requests", async () => {
    fetchMock.mockImplementation((_request, init) => {
      const url = (init?.body as URLSearchParams).get("url") ?? "";
      return Promise.resolve(sourceResponse(url));
    });

    const documents = await fetchSourceDocuments([
      "https://one.example/schedule",
      "https://one.example/schedule#duplicate",
      "https://two.example/schedule",
      "https://three.example/schedule",
      "https://four.example/schedule",
      "https://five.example/schedule",
      "https://ignored.example/schedule",
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(documents).toHaveLength(5);
    expect(documents.map((document) => document.url)).not.toContain(
      "https://ignored.example/schedule"
    );
  });

  it.each([
    "http://artist.example/schedule",
    "https://localhost/schedule",
    "https://10.2.3.4/schedule",
    "https://[::1]/schedule",
    "https://user:secret@artist.example/schedule",
  ])("rejects unsafe source URL %s before calling Jina", async (url) => {
    await expect(fetchSourceDocuments([url])).rejects.toMatchObject({
      code: "UNSAFE_SOURCE_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires JINA_KEY for source reading", async () => {
    delete process.env.JINA_KEY;

    await expect(
      fetchSourceDocuments(["https://artist.example/schedule"])
    ).rejects.toBeInstanceOf(WebSearchConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-successful and malformed Jina Reader responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "upstream failed" }, 502));
    await expect(
      fetchSourceDocuments(["https://artist.example/failed"])
    ).rejects.toMatchObject({ code: "SOURCE_FETCH_FAILED" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { url: "missing content" } }));
    await expect(
      fetchSourceDocuments(["https://artist.example/malformed"])
    ).rejects.toMatchObject({ code: "SOURCE_RESPONSE_INVALID" });
  });

  it("rejects oversized Jina Reader responses before reading the body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(2 * 1024 * 1024 + 1) },
      })
    );

    await expect(
      fetchSourceDocuments(["https://artist.example/large"])
    ).rejects.toMatchObject({ code: "SOURCE_RESPONSE_TOO_LARGE" });
  });

  it("aborts Jina Reader at the request timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_request, init) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      );
      return promise;
    });

    const rejection = expect(
      fetchSourceDocuments(["https://artist.example/schedule"])
    ).rejects.toMatchObject({ code: "SOURCE_FETCH_FAILED" });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
  });

  it("exposes typed discovery errors without leaking the Jina key", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));

    const error = await fetchSourceDocuments([
      "https://artist.example/schedule",
    ]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SourceDiscoveryError);
    expect(String(error)).not.toContain("jina-test-key");
  });
});
