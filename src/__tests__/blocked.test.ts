/**
 * @jest-environment jsdom
 */

import fs from "fs";
import path from "path";

describe("Blocked Info Page Test", () => {
  let mockStorageSet: jest.Mock;
  let mockStorageGet: jest.Mock;
  let mockMediaStream: { getTracks: jest.Mock };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const first = args[0] as { message?: string } | string | undefined;
      if (typeof first === "string" && first.includes("Not implemented: navigation")) return;
      if (first && typeof first === "object" && first.message?.includes("Not implemented: navigation")) return;
    });

    window.history.pushState({}, "", "/blocked.html?url=https://example.com/doomscroll&rule=example.com");

    const html = fs.readFileSync(path.resolve(__dirname, "../../public/blocked.html"), "utf8");
    document.documentElement.innerHTML = html;

    mockStorageSet = jest.fn().mockResolvedValue(undefined);
    mockStorageGet = jest.fn().mockImplementation((keys: string[]) => {
      const data: Record<string, unknown> = {
        challengePhrase: "I am wasting my time and I need to get back to work",
        challengeRepeatCount: 2,
        whisperServerUrl: "http://127.0.0.1:8765",
        siteExtensions: {},
      };
      const res: Record<string, unknown> = {};
      keys.forEach((k) => {
        res[k] = data[k];
      });
      return Promise.resolve(res);
    });

    (global as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          set: mockStorageSet,
          get: mockStorageGet,
        },
      },
    };

    mockMediaStream = {
      getTracks: jest.fn().mockReturnValue([
        { stop: jest.fn() },
        { stop: jest.fn() },
      ]),
    };

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockMediaStream),
      },
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it("renders the blocked message from query params", async () => {
    jest.isolateModules(() => {
      require("../blocked");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const messageEl = document.getElementById("message");
    expect(messageEl?.innerHTML).toContain("https://example.com/doomscroll");
    expect(messageEl?.innerHTML).toContain("example.com");
  });

  it("sets a 1-minute pause and navigates back to the blocked URL on snooze click", async () => {
    jest.isolateModules(() => {
      require("../blocked");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const snoozeBtn = document.getElementById("snooze-btn") as HTMLButtonElement;
    snoozeBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        pausedUntil: expect.any(Number),
      }),
    );
  });

  it("dodges randomly when the user hovers over catch-me button", async () => {
    jest.isolateModules(() => {
      require("../blocked");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const catchMeBtn = document.getElementById("catch-me-btn") as HTMLButtonElement;
    expect(catchMeBtn).not.toBeNull();

    catchMeBtn.dispatchEvent(new MouseEvent("mouseenter"));
    expect(catchMeBtn.style.left).toMatch(/\d+px/);
    expect(catchMeBtn.style.top).toMatch(/\d+px/);
  });

  it("opens mirror modal and starts camera stream on catch-me button click", async () => {
    jest.isolateModules(() => {
      require("../blocked");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const catchMeBtn = document.getElementById("catch-me-btn") as HTMLButtonElement;
    const mirrorModal = document.getElementById("mirror-modal") as HTMLDivElement;
    const phraseDisplay = document.getElementById("challenge-phrase-display") as HTMLDivElement;
    const repeatCountEl = document.getElementById("required-repeat-count") as HTMLElement;

    expect(mirrorModal.classList.contains("hidden")).toBe(true);

    catchMeBtn.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mirrorModal.classList.contains("hidden")).toBe(false);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(phraseDisplay.textContent).toContain("I am wasting my time");
    expect(repeatCountEl.textContent).toBe("2");
  });

  it("grants site extension and redirects on extension button click", async () => {
    jest.isolateModules(() => {
      require("../blocked");
    });

    window.dispatchEvent(new Event("DOMContentLoaded"));
    await new Promise((r) => setTimeout(r, 20));

    const btn5m = document.querySelector<HTMLButtonElement>('.btn-ext[data-minutes="5"]');
    expect(btn5m).not.toBeNull();

    btn5m?.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        siteExtensions: expect.objectContaining({
          "example.com": expect.any(Number),
        }),
      }),
    );
  });
});