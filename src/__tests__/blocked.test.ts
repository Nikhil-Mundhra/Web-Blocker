/**
 * @jest-environment jsdom
 */

import fs from "fs";
import path from "path";

describe("Blocked Info Page Test", () => {
  let mockStorageSet: jest.Mock;

  beforeEach(() => {
    window.history.pushState({}, "", "/blocked.html?url=https://example.com/doomscroll&rule=example.com");

    const html = fs.readFileSync(path.resolve(__dirname, "../../public/blocked.html"), "utf8");
    document.documentElement.innerHTML = html;

    mockStorageSet = jest.fn().mockResolvedValue(undefined);

    (global as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          set: mockStorageSet,
          get: jest.fn().mockResolvedValue({}),
        },
      },
    };
  });

  afterEach(() => {
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
});