import storage from "../storage";
import scrollTax from "./scroll-tax";
import removeProtocol from "./remove-protocol";

const createContextMenu = () => {
  const parentId = chrome.contextMenus.create({
    id: "scroll_tax",
    title: "ScrollTax",
    documentUrlPatterns: ["https://*/*", "http://*/*"],
  });

  const blockOneId = "block_one";
  chrome.contextMenus.create({
    parentId,
    id: blockOneId,
    title: "Block this page only",
  });

  const blockAllId = "block_all";
  chrome.contextMenus.create({
    parentId,
    id: blockAllId,
    title: "Block entire website",
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const tabId = tab?.id;
    if (!tabId || ![blockOneId, blockAllId].includes(String(info.menuItemId))) {
      return;
    }

    const url = info.pageUrl;
    const blockedUrl = info.menuItemId === blockOneId
      ? removeProtocol(url)
      : new URL(url).host;

    storage.get(["blocked"]).then(({ blocked }) => {
      const updatedBlocked = [...blocked, blockedUrl];
      storage.set({ blocked: updatedBlocked });
      scrollTax({ blocked: updatedBlocked, tabId, url });
    });
  });
};

export default (meetsCreateCondition: boolean) => {
  chrome.contextMenus.removeAll(() => {
    if (meetsCreateCondition) {
      createContextMenu();
    }
  });
};
