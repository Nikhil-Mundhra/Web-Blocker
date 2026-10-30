import scrollTax from "../scroll-tax";
import storage, { DEFAULTS } from "../../storage";

describe("scrollTax()", () => {
  const originalChrome = (global as unknown as { chrome: unknown }).chrome;

  let tabsRemoveMock: jest.Mock;
  let tabsUpdateMock: jest.Mock;
  let storageGetMock: jest.SpyInstance;

  beforeEach(() => {
    tabsRemoveMock = jest.fn().mockReturnValue(Promise.resolve());
    tabsUpdateMock = jest.fn().mockReturnValue(Promise.resolve());

    (global as unknown as { chrome: unknown }).chrome = {
      tabs: {
        remove: tabsRemoveMock,
        update: tabsUpdateMock,
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
      },
    };

    storageGetMock = jest.spyOn(storage, "get").mockImplementation(async (keys) => {
      const result: Record<string, unknown> = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        result[k] = (DEFAULTS as Record<string, unknown>)[k];
      });
      return result as never;
    });

    jest.spyOn(storage, "set").mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    (global as unknown as { chrome: unknown }).chrome = originalChrome;
    jest.restoreAllMocks();
  });

  it("does nothing if url does not start with http", async () => {
    scrollTax({ blocked: ["example.com"], tabId: 1, url: "chrome://extensions" });
    await new Promise(process.nextTick);

    expect(tabsRemoveMock).not.toHaveBeenCalled();
    expect(tabsUpdateMock).not.toHaveBeenCalled();
  });

  it("closes tab when resolution is CLOSE_TAB and site matches blocklist", async () => {
    scrollTax({ blocked: ["example.com"], tabId: 10, url: "https://example.com/page" });
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsRemoveMock).toHaveBeenCalledWith(10);
  });

  it("redirects tab when resolution is REDIRECT", async () => {
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      resolution: "REDIRECT",
      redirectUrl: "https://mysite.com",
    } as never);

    scrollTax({ blocked: ["example.com"], tabId: 20, url: "https://example.com/page" });
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsUpdateMock).toHaveBeenCalledWith(20, { url: "https://mysite.com" });
  });

  it("bypasses blocking when temporarily paused", async () => {
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      pausedUntil: Date.now() + 60000,
    } as never);

    scrollTax({ blocked: ["example.com"], tabId: 30, url: "https://example.com/page" });
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsRemoveMock).not.toHaveBeenCalled();
    expect(tabsUpdateMock).not.toHaveBeenCalled();
  });

  it("bypasses blocking when outside schedule hours", async () => {
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      schedule: {
        enabled: true,
        days: [0], // Sunday only
        startTime: "09:00",
        endTime: "17:00",
      },
    } as never);

    // Monday morning
    const originalDate = global.Date;
    const mockDate = new Date("2026-10-26T10:00:00");
    global.Date = class extends Date {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    } as typeof Date;

    try {
      scrollTax({ blocked: ["example.com"], tabId: 40, url: "https://example.com/page" });
      await new Promise((r) => setTimeout(r, 10));

      expect(tabsRemoveMock).not.toHaveBeenCalled();
    } finally {
      global.Date = originalDate;
    }
  });

  it("blocks non-approved sites when mode is WHITELIST", async () => {
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      mode: "WHITELIST",
      resolution: "CLOSE_TAB",
    } as never);

    // Site is not in allowed list
    scrollTax({ blocked: ["!allowed.com"], tabId: 50, url: "https://randomsite.com" });
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsRemoveMock).toHaveBeenCalledWith(50);
  });

  it("permits approved sites when mode is WHITELIST", async () => {
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      mode: "WHITELIST",
      resolution: "CLOSE_TAB",
    } as never);

    scrollTax({ blocked: ["!allowed.com"], tabId: 60, url: "https://allowed.com/home" });
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsRemoveMock).not.toHaveBeenCalled();
  });

  it("bypasses blocklist when an active Mirror of Accountability extension exists for the domain", async () => {
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      siteExtensions: { "youtube.com": Date.now() + 5 * 60 * 1000 },
    } as never);

    scrollTax({ blocked: ["youtube.com"], tabId: 70, url: "https://www.youtube.com/watch?v=123" });
    await new Promise((r) => setTimeout(r, 10));

    expect(tabsRemoveMock).not.toHaveBeenCalled();
  });

  it("defers domain-level block when domain also has remaining Daily Time Limit budget, but still blocks specific sub-path rules", async () => {
    // 1. Domain-level rule in blocked + remaining time limit -> allowed until budget runs out
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      timeLimits: { "youtube.com": 15 },
      dailyUsage: {},
    } as never);

    scrollTax({ blocked: ["youtube.com/", "youtube.com/shorts*"], tabId: 80, url: "https://www.youtube.com/watch?v=abc" });
    await new Promise((r) => setTimeout(r, 10));
    expect(tabsRemoveMock).not.toHaveBeenCalled();

    // 2. Specific sub-path rule (youtube.com/shorts*) -> still blocked immediately
    storageGetMock.mockResolvedValueOnce({
      ...DEFAULTS,
      timeLimits: { "youtube.com": 15 },
      dailyUsage: {},
    } as never);

    scrollTax({ blocked: ["youtube.com/", "youtube.com/shorts*"], tabId: 81, url: "https://www.youtube.com/shorts/xyz" });
    await new Promise((r) => setTimeout(r, 10));
    expect(tabsRemoveMock).toHaveBeenCalledWith(81);
  });
});