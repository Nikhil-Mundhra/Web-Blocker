/**
 * @jest-environment jsdom
 */

import fs from "fs";
import path from "path";
import { DEFAULTS } from "../storage";

describe("Options Page Integration Test", () => {
  let storageState: Record<string, unknown>;
  let mockStorageGet: jest.Mock;
  let mockStorageSet: jest.Mock;
  let storageChangeListeners: ((changes: Record<string, { newValue?: unknown }>) => void)[];

  beforeEach(() => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../public/options.html"), "utf8");
    document.documentElement.innerHTML = html;

    storageState = {
      ...DEFAULTS,
      enabled: true,
      mode: "BLOCKLIST",
      blocked: ["example.com"],
      resolution: "CLOSE_TAB",
      redirectUrl: "https://redirect.com",
      disableDelay: 0,
      lockedUntil: null,
      whatsNewDismissed: false,
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
      storageChangeListeners.forEach((listener) => {
        const changes: Record<string, { newValue?: unknown }> = {};
        Object.keys(items).forEach((k) => {
          changes[k] = { newValue: items[k] };
        });
        listener(changes);
      });
      return Promise.resolve();
    });

    storageChangeListeners = [];

    (global as unknown as { chrome: unknown }).chrome = {
      runtime: {
        getURL: (p: string) => `chrome-extension://test/${p}`,
      },
      storage: {
        local: {
          get: mockStorageGet,
          set: mockStorageSet,
          onChanged: {
            addListener: (cb: (changes: Record<string, { newValue?: unknown }>) => void) => {
              storageChangeListeners.push(cb);
            },
          },
        },
      },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("initializes UI with storage values", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const enabledSelect = document.getElementById("enabled") as HTMLSelectElement;
    const modeSelect = document.getElementById("mode") as HTMLSelectElement;
    const blockedList = document.getElementById("blocked-list") as HTMLTextAreaElement;
    const whatsNewBanner = document.getElementById("whats-new-banner") as HTMLDivElement;

    expect(enabledSelect.value).toBe("YES");
    expect(modeSelect.value).toBe("BLOCKLIST");
    expect(blockedList.value).toBe("example.com");
    expect(whatsNewBanner.classList.contains("hidden")).toBe(false);
  });

  it("updates mode and saves to storage", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const modeSelect = document.getElementById("mode") as HTMLSelectElement;
    modeSelect.value = "WHITELIST";
    modeSelect.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "WHITELIST",
      }),
    );
  });

  it("updates resolution and redirectUrl in storage", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const resSelect = document.getElementById("resolution") as HTMLSelectElement;
    resSelect.value = "REDIRECT";
    resSelect.dispatchEvent(new Event("change"));

    const redirectInput = document.getElementById("redirect-url") as HTMLInputElement;
    redirectInput.value = "https://custom-target.org";
    redirectInput.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: "REDIRECT",
      }),
    );
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: "https://custom-target.org",
      }),
    );
  });

  it("enforces cooldown when disabling if disableDelay > 0", async () => {
    storageState.disableDelay = 30;

    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const enabledSelect = document.getElementById("enabled") as HTMLSelectElement;
    const cooldownModal = document.getElementById("cooldown-modal") as HTMLDivElement;

    // User attempts to turn off
    enabledSelect.value = "NO";
    enabledSelect.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 20));

    // Cooldown modal should be revealed, and enabled remains YES
    expect(cooldownModal.classList.contains("hidden")).toBe(false);
    expect(enabledSelect.value).toBe("YES");

    // Click cancel
    const cancelBtn = document.getElementById("cancel-cooldown-btn") as HTMLButtonElement;
    cancelBtn.click();
    expect(cooldownModal.classList.contains("hidden")).toBe(true);
  });

  it("locks settings when lock button is clicked", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const lockDuration = document.getElementById("lock-duration") as HTMLSelectElement;
    lockDuration.value = "30";

    const lockBtn = document.getElementById("lock-btn") as HTMLButtonElement;
    lockBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lockedUntil: expect.any(Number),
      }),
    );
  });

  it("toggles the syntax modal via help button and close button", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const helpBtn = document.getElementById("syntax-help-btn") as HTMLButtonElement;
    const closeBtn = document.getElementById("close-syntax-modal") as HTMLButtonElement;
    const modal = document.getElementById("syntax-modal") as HTMLDivElement;

    expect(modal.classList.contains("hidden")).toBe(true);

    helpBtn.click();
    expect(modal.classList.contains("hidden")).toBe(false);

    closeBtn.click();
    expect(modal.classList.contains("hidden")).toBe(true);
  });

  it("dismisses what's new banner", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const dismissBtn = document.getElementById("dismiss-whats-new") as HTMLButtonElement;
    const banner = document.getElementById("whats-new-banner") as HTMLDivElement;

    dismissBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsNewDismissed: true,
      }),
    );
    expect(banner.classList.contains("hidden")).toBe(true);
  });
});