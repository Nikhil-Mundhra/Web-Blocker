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

  it("manages daily time limits per website", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const domainInput = document.getElementById("limit-domain") as HTMLInputElement;
    const minutesInput = document.getElementById("limit-minutes") as HTMLInputElement;
    const addBtn = document.getElementById("set-limit-btn") as HTMLButtonElement;
    const tbody = document.getElementById("time-limits-tbody") as HTMLTableSectionElement;

    // Add time limit for reddit.com: 30 mins
    domainInput.value = "https://reddit.com/r/all";
    minutesInput.value = "30";
    addBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        timeLimits: { "reddit.com": 30 },
      }),
    );

    // Verify row rendered in tbody
    expect(tbody.innerHTML).toContain("reddit.com");
    expect(tbody.innerHTML).toContain("30 min / day");

    // Click delete button -> should open the Mirror of Accountability modal instead of immediately deleting
    const deleteBtn = tbody.querySelector<HTMLButtonElement>(".delete-limit-btn");
    const mirrorModal = document.getElementById("mirror-modal") as HTMLDivElement;
    const mirrorTargetDomain = document.getElementById("mirror-target-domain") as HTMLElement;
    expect(deleteBtn).not.toBeNull();
    expect(mirrorModal.classList.contains("hidden")).toBe(true);

    mockStorageSet.mockClear();
    deleteBtn?.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mirrorModal.classList.contains("hidden")).toBe(false);
    expect(mirrorTargetDomain.textContent).toBe("reddit.com");
    expect(mockStorageSet).not.toHaveBeenCalled();

    // Verify phrase in the Mirror of Accountability to complete deletion
    const typedInput = document.getElementById("typed-phrase-input") as HTMLTextAreaElement;
    const verifyTypedBtn = document.getElementById("verify-typed-btn") as HTMLButtonElement;
    const phrase = DEFAULTS.challengePhrase;
    typedInput.value = `${phrase}. ${phrase}. ${phrase}.`;
    verifyTypedBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        timeLimits: {},
      }),
    );
    expect(mirrorModal.classList.contains("hidden")).toBe(true);
  });

  it("configures Mirror of Accountability phrase and repeat count", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const phraseInput = document.getElementById("challenge-phrase") as HTMLInputElement;
    const countInput = document.getElementById("challenge-repeat-count") as HTMLInputElement;

    phraseInput.value = "I am focusing on my deep work";
    phraseInput.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        challengePhrase: "I am focusing on my deep work",
      }),
    );

    countInput.value = "4";
    countInput.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeRepeatCount: 4,
      }),
    );
  });

  it("tests MLX-Whisper server connectivity status", async () => {
    jest.isolateModules(() => {
      require("../options");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const testBtn = document.getElementById("test-whisper-btn") as HTMLButtonElement;
    const statusBadge = document.getElementById("whisper-status-badge") as HTMLSpanElement;

    // Mock successful fetch
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "healthy", model: "mlx-community/whisper-small-mlx" }),
    });

    testBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(statusBadge.textContent).toContain("Online (MLX-Whisper)");

    // Mock failed fetch
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Connection refused"));
    testBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(statusBadge.textContent).toContain("Offline (Web Speech Fallback)");

    global.fetch = originalFetch;
  });
});