/**
 * @jest-environment jsdom
 */

import fs from "fs";
import path from "path";
import { DEFAULTS } from "../storage";

describe("Popup Integration Test", () => {
  let mockTabsQuery: jest.Mock;
  let mockTabsRemove: jest.Mock;
  let mockTabsUpdate: jest.Mock;
  let mockWindowClose: jest.Mock;
  let mockOpenOptionsPage: jest.Mock;
  let storageState: Record<string, unknown>;
  let mockStorageGet: jest.Mock;
  let mockStorageSet: jest.Mock;

  beforeEach(() => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../public/popup.html"), "utf8");
    document.documentElement.innerHTML = html;

    storageState = {
      ...DEFAULTS,
      enabled: true,
      blocked: [],
      pausedUntil: null,
    };

    mockStorageGet = jest.fn().mockImplementation((keys: string[]) => {
      const res: Record<string, unknown> = {};
      keys.forEach((k) => {
        res[k] = storageState[k];
      });
      return Promise.resolve(res);
    });

    mockStorageSet = jest.fn().mockImplementation((items: Record<string, unknown>) => {
      Object.assign(storageState, items);
      return Promise.resolve();
    });

    mockTabsQuery = jest.fn().mockResolvedValue([{ id: 101, url: "https://example.com/subpage?param=1" }]);
    mockTabsRemove = jest.fn().mockResolvedValue(undefined);
    mockTabsUpdate = jest.fn().mockResolvedValue(undefined);
    mockOpenOptionsPage = jest.fn();
    mockWindowClose = jest.fn();
    window.close = mockWindowClose;

    (global as unknown as { chrome: unknown }).chrome = {
      tabs: {
        query: mockTabsQuery,
        remove: mockTabsRemove,
        update: mockTabsUpdate,
      },
      runtime: {
        openOptionsPage: mockOpenOptionsPage,
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      storage: {
        local: {
          get: mockStorageGet,
          set: mockStorageSet,
          onChanged: { addListener: jest.fn() },
        },
      },
    };
  });

  afterEach(() => {
    window.dispatchEvent(new Event("unload"));
    jest.restoreAllMocks();
  });

  it("initializes and displays the active tab hostname and Active status", async () => {
    // Import popup module
    jest.isolateModules(() => {
      require("../popup");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const currentUrlEl = document.getElementById("current-url");
    const statusBadge = document.getElementById("status-badge");

    expect(currentUrlEl?.textContent).toBe("example.com");
    expect(statusBadge?.textContent).toBe("Active");
  });

  it("blocks the current page when 'Block this page' is clicked", async () => {
    jest.isolateModules(() => {
      require("../popup");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const blockPageBtn = document.getElementById("block-page-btn") as HTMLButtonElement;
    blockPageBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        blocked: ["example.com/subpage?param=1"],
      }),
    );
    expect(mockWindowClose).toHaveBeenCalled();
  });

  it("blocks the entire domain when 'Block entire site' is clicked", async () => {
    jest.isolateModules(() => {
      require("../popup");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const blockSiteBtn = document.getElementById("block-site-btn") as HTMLButtonElement;
    blockSiteBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        blocked: ["example.com"],
      }),
    );
    expect(mockWindowClose).toHaveBeenCalled();
  });

  it("triggers a 1-minute break when '1m Break' is clicked", async () => {
    jest.isolateModules(() => {
      require("../popup");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const pause1mBtn = document.getElementById("pause-1m-btn") as HTMLButtonElement;
    pause1mBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        pausedUntil: expect.any(Number),
      }),
    );
  });

  it("disables block buttons for non-web (e.g. internal browser) pages", async () => {
    mockTabsQuery.mockResolvedValueOnce([{ id: 102, url: "chrome://extensions" }]);

    jest.isolateModules(() => {
      require("../popup");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const blockPageBtn = document.getElementById("block-page-btn") as HTMLButtonElement;
    const blockSiteBtn = document.getElementById("block-site-btn") as HTMLButtonElement;

    expect(blockPageBtn.disabled).toBe(true);
    expect(blockSiteBtn.disabled).toBe(true);
  });
});