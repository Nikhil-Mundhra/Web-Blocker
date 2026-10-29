import storage, {
  Schema, Resolution, Mode, CounterPeriod, RESOLUTIONS, Schedule, BLOCKED_EXAMPLE,
} from "./storage";

const UI = (() => {
  const elements = {
    whatsNewBanner: document.getElementById("whats-new-banner") as HTMLDivElement,
    dismissWhatsNew: document.getElementById("dismiss-whats-new") as HTMLButtonElement,
    lockedBanner: document.getElementById("locked-banner") as HTMLDivElement,
    lockedTime: document.getElementById("locked-time") as HTMLElement,
    enabled: document.getElementById("enabled") as HTMLSelectElement,
    mode: document.getElementById("mode") as HTMLSelectElement,
    contextMenu: document.getElementById("context-menu") as HTMLSelectElement,
    blockedList: document.getElementById("blocked-list") as HTMLTextAreaElement,
    syntaxHelpBtn: document.getElementById("syntax-help-btn") as HTMLButtonElement,
    syntaxModal: document.getElementById("syntax-modal") as HTMLDivElement,
    closeSyntaxModal: document.getElementById("close-syntax-modal") as HTMLButtonElement,
    resolution: document.getElementById("resolution") as HTMLSelectElement,
    redirectUrl: document.getElementById("redirect-url") as HTMLInputElement,
    counterShow: document.getElementById("counter-show") as HTMLSelectElement,
    counterPeriod: document.getElementById("counter-period") as HTMLSelectElement,
    scheduleEnabled: document.getElementById("schedule-enabled") as HTMLSelectElement,
    scheduleDays: document.querySelectorAll<HTMLInputElement>("#schedule-days input[type='checkbox']"),
    scheduleStart: document.getElementById("schedule-start") as HTMLInputElement,
    scheduleEnd: document.getElementById("schedule-end") as HTMLInputElement,
    disableDelay: document.getElementById("disable-delay") as HTMLSelectElement,
    lockDuration: document.getElementById("lock-duration") as HTMLSelectElement,
    lockBtn: document.getElementById("lock-btn") as HTMLButtonElement,
    cooldownModal: document.getElementById("cooldown-modal") as HTMLDivElement,
    cooldownTimer: document.getElementById("cooldown-timer") as HTMLElement,
    cancelCooldownBtn: document.getElementById("cancel-cooldown-btn") as HTMLButtonElement,
  };

  elements.blockedList.placeholder = BLOCKED_EXAMPLE.join("\n");

  const booleanToString = (b: boolean) => (b ? "YES" : "NO");
  const stringToBoolean = (s: string) => s === "YES";

  const getEventTargetValue = (event: Event) => (event.target as HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement).value;
  const stringToBlocked = (string: string) => string.split("\n").map((s) => s.trim()).filter(Boolean);

  let activeCooldownInterval: NodeJS.Timeout | null = null;
  let activeLockInterval: NodeJS.Timeout | null = null;
  let currentDisableDelay = 0;
  let currentLockedUntil: number | null = null;

  // 1. Enabled change with Cooldown protection (Issue #6)
  elements.enabled.addEventListener("change", (event) => {
    const desiredState = stringToBoolean(getEventTargetValue(event));

    if (!desiredState && currentDisableDelay > 0) {
      // Revert select temporarily until cooldown finishes
      elements.enabled.value = "YES";
      startCooldown(currentDisableDelay);
      return;
    }

    storage.set({ enabled: desiredState });
  });

  const startCooldown = (seconds: number) => {
    if (activeCooldownInterval) {
      clearInterval(activeCooldownInterval);
    }

    let remaining = seconds;
    elements.cooldownTimer.textContent = String(remaining);
    elements.cooldownModal.classList.remove("hidden");

    activeCooldownInterval = setInterval(() => {
      remaining -= 1;
      elements.cooldownTimer.textContent = String(remaining);

      if (remaining <= 0) {
        if (activeCooldownInterval) {
          clearInterval(activeCooldownInterval);
        }
        elements.cooldownModal.classList.add("hidden");
        elements.enabled.value = "NO";
        storage.set({ enabled: false });
      }
    }, 1000);
  };

  elements.cancelCooldownBtn.addEventListener("click", () => {
    if (activeCooldownInterval) {
      clearInterval(activeCooldownInterval);
      activeCooldownInterval = null;
    }
    elements.cooldownModal.classList.add("hidden");
  });

  // 2. Mode change (Issue #11)
  elements.mode.addEventListener("change", (event) => {
    const mode = getEventTargetValue(event) as Mode;
    storage.set({ mode });
  });

  // 3. Context Menu
  elements.contextMenu.addEventListener("change", (event) => {
    const contextMenu = stringToBoolean(getEventTargetValue(event));
    storage.set({ contextMenu });
  });

  // 4. Blocked List
  elements.blockedList.addEventListener("input", (event) => {
    const blocked = stringToBlocked(getEventTargetValue(event));
    storage.set({ blocked });
  });

  // 5. Resolution & Redirect URL (Issue #12)
  elements.resolution.addEventListener("change", (event) => {
    const resolution = getEventTargetValue(event) as Resolution;
    storage.set({ resolution });
  });

  elements.redirectUrl.addEventListener("input", (event) => {
    const redirectUrl = getEventTargetValue(event);
    storage.set({ redirectUrl });
  });

  // 6. Blocked info page counter
  elements.counterShow.addEventListener("change", (event) => {
    const counterShow = stringToBoolean(getEventTargetValue(event));
    storage.set({ counterShow });
  });

  elements.counterPeriod.addEventListener("change", (event) => {
    const counterPeriod = getEventTargetValue(event) as CounterPeriod;
    storage.set({ counterPeriod });
  });

  // 7. Schedule (Issue #1)
  const saveSchedule = () => {
    const enabled = stringToBoolean(elements.scheduleEnabled.value);
    const days: number[] = [];
    elements.scheduleDays.forEach((cb) => {
      if (cb.checked) {
        days.push(Number(cb.value));
      }
    });

    const schedule: Schedule = {
      enabled,
      days,
      startTime: elements.scheduleStart.value || "09:00",
      endTime: elements.scheduleEnd.value || "17:00",
    };

    storage.set({ schedule });
  };

  elements.scheduleEnabled.addEventListener("change", () => {
    saveSchedule();
  });

  elements.scheduleDays.forEach((cb) => {
    cb.addEventListener("change", () => {
      saveSchedule();
    });
  });

  elements.scheduleStart.addEventListener("change", () => {
    saveSchedule();
  });

  elements.scheduleEnd.addEventListener("change", () => {
    saveSchedule();
  });

  // 8. Disable Cooldown setting (Issue #6)
  elements.disableDelay.addEventListener("change", (event) => {
    const disableDelay = Number(getEventTargetValue(event));
    currentDisableDelay = disableDelay;
    storage.set({ disableDelay });
  });

  // 9. Lock Settings (Issue #4)
  elements.lockBtn.addEventListener("click", () => {
    const minutes = Number(elements.lockDuration.value) || 15;
    const lockedUntil = Date.now() + minutes * 60 * 1000;
    storage.set({ lockedUntil });
  });

  const checkLockState = (lockedUntil: number | null) => {
    currentLockedUntil = lockedUntil;
    const now = Date.now();

    if (lockedUntil && lockedUntil > now) {
      document.body.classList.add("locked");
      elements.lockedBanner.classList.remove("hidden");

      const date = new Date(lockedUntil);
      elements.lockedTime.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (activeLockInterval) {
        clearInterval(activeLockInterval);
      }

      activeLockInterval = setInterval(() => {
        if (Date.now() >= (currentLockedUntil || 0)) {
          if (activeLockInterval) {
            clearInterval(activeLockInterval);
            activeLockInterval = null;
          }
          storage.set({ lockedUntil: null });
        }
      }, 1000);
    } else {
      document.body.classList.remove("locked");
      elements.lockedBanner.classList.add("hidden");
      if (activeLockInterval) {
        clearInterval(activeLockInterval);
        activeLockInterval = null;
      }
    }
  };

  // 10. Syntax Reference Modal (Issue #13)
  const openSyntaxModal = () => {
    elements.syntaxModal.classList.remove("hidden");
  };

  const closeSyntaxModal = () => {
    elements.syntaxModal.classList.add("hidden");
  };

  elements.syntaxHelpBtn.addEventListener("click", openSyntaxModal);
  elements.closeSyntaxModal.addEventListener("click", closeSyntaxModal);

  elements.syntaxModal.addEventListener("click", (e) => {
    if (e.target === elements.syntaxModal) {
      closeSyntaxModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSyntaxModal();
      if (activeCooldownInterval) {
        clearInterval(activeCooldownInterval);
        activeCooldownInterval = null;
      }
      elements.cooldownModal.classList.add("hidden");
    } else if ((e.key === "?" || (e.key === "/" && (e.ctrlKey || e.metaKey))) && document.activeElement !== elements.blockedList && document.activeElement !== elements.redirectUrl) {
      elements.syntaxModal.classList.toggle("hidden");
    }
  });

  // 11. What's New Dismiss (Issue #14)
  elements.dismissWhatsNew.addEventListener("click", () => {
    storage.set({ whatsNewDismissed: true });
    elements.whatsNewBanner.classList.add("hidden");
  });

  const init = <T extends Partial<Schema>>(items: T) => {
    if (items.whatsNewDismissed !== undefined) {
      elements.whatsNewBanner.classList.toggle("hidden", items.whatsNewDismissed);
    }

    if (items.lockedUntil !== undefined) {
      checkLockState(items.lockedUntil);
    }

    if (items.disableDelay !== undefined) {
      currentDisableDelay = items.disableDelay;
      elements.disableDelay.value = String(items.disableDelay);
    }

    if (items.enabled !== undefined) {
      elements.enabled.value = booleanToString(items.enabled);
    }

    if (items.mode !== undefined) {
      elements.mode.value = items.mode;
    }

    if (items.contextMenu !== undefined) {
      elements.contextMenu.value = booleanToString(items.contextMenu);
    }

    if (items.blocked !== undefined) {
      const valueAsBlocked = stringToBlocked(elements.blockedList.value);
      if (JSON.stringify(valueAsBlocked) !== JSON.stringify(items.blocked)) {
        elements.blockedList.value = items.blocked.join("\r\n");
      }
    }

    if (items.resolution !== undefined) {
      elements.resolution.value = items.resolution;
      RESOLUTIONS.forEach((oneResolution) => {
        document.body.classList.remove(`resolution-${oneResolution}`);
      });
      document.body.classList.add(`resolution-${items.resolution}`);
    }

    if (items.redirectUrl !== undefined) {
      elements.redirectUrl.value = items.redirectUrl;
    }

    if (items.counterShow !== undefined) {
      elements.counterShow.value = booleanToString(items.counterShow);
      document.body.classList.toggle("counter-show", items.counterShow);
    }

    if (items.counterPeriod !== undefined) {
      elements.counterPeriod.value = items.counterPeriod;
    }

    if (items.schedule !== undefined) {
      elements.scheduleEnabled.value = booleanToString(items.schedule.enabled);
      document.body.classList.toggle("schedule-enabled", items.schedule.enabled);

      elements.scheduleDays.forEach((cb) => {
        cb.checked = items.schedule?.days.includes(Number(cb.value)) || false;
      });

      if (items.schedule.startTime) {
        elements.scheduleStart.value = items.schedule.startTime;
      }
      if (items.schedule.endTime) {
        elements.scheduleEnd.value = items.schedule.endTime;
      }
    }
  };

  return { elements, init };
})();

window.addEventListener("DOMContentLoaded", () => {
  const keys: (keyof Schema)[] = [
    "enabled",
    "mode",
    "contextMenu",
    "blocked",
    "resolution",
    "redirectUrl",
    "counterShow",
    "counterPeriod",
    "schedule",
    "disableDelay",
    "lockedUntil",
    "whatsNewDismissed",
  ];

  storage.get(keys).then((local) => {
    UI.init(local);
    document.body.classList.add("ready");
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    keys.forEach((key) => {
      if (changes[key]) {
        UI.init({ [key]: changes[key].newValue });
      }
    });
  });
});