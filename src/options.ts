import storage, {
  Schema, Resolution, Mode, CounterPeriod, RESOLUTIONS, Schedule, BLOCKED_EXAMPLE, DEFAULTS,
} from "./storage";
import { normalizeHost, getTodayKey } from "./helpers/time-limits";
import { verifySpokenPhrase } from "./helpers/verify-phrase";
import { convertBlobToWav } from "./helpers/audio-wav";
import {
  generateSyncKey,
  pushSync,
  pullSync,
  extractSyncPayload,
} from "./helpers/sync";

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } }
}

interface ISpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

interface IWindow extends Window {
  webkitSpeechRecognition?: new () => ISpeechRecognition
  SpeechRecognition?: new () => ISpeechRecognition
}

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

    // Time Limits
    limitDomain: document.getElementById("limit-domain") as HTMLInputElement,
    limitMinutes: document.getElementById("limit-minutes") as HTMLInputElement,
    setLimitBtn: document.getElementById("set-limit-btn") as HTMLButtonElement,
    timeLimitsTbody: document.getElementById("time-limits-tbody") as HTMLTableSectionElement,

    // Mirror / Speech Challenge Settings
    challengePhrase: document.getElementById("challenge-phrase") as HTMLInputElement,
    challengeRepeatCount: document.getElementById("challenge-repeat-count") as HTMLInputElement,
    whisperServerUrl: document.getElementById("whisper-server-url") as HTMLInputElement,
    testWhisperBtn: document.getElementById("test-whisper-btn") as HTMLButtonElement,
    whisperStatusBadge: document.getElementById("whisper-status-badge") as HTMLSpanElement,

    // Mirror of Accountability Modal (for deleting a Daily Time Limit)
    mirrorModal: document.getElementById("mirror-modal") as HTMLDivElement,
    closeMirrorBtn: document.getElementById("close-mirror-btn") as HTMLButtonElement,
    cancelMirrorChallenge: document.getElementById("cancel-mirror-challenge") as HTMLButtonElement,
    mirrorTargetDomain: document.getElementById("mirror-target-domain") as HTMLElement,
    requiredRepeatCount: document.getElementById("required-repeat-count") as HTMLElement,
    challengePhraseDisplay: document.getElementById("challenge-phrase-display") as HTMLDivElement,
    whisperModalStatus: document.getElementById("whisper-modal-status") as HTMLSpanElement,
    mirrorVideo: document.getElementById("mirror-video") as HTMLVideoElement,
    recordingOverlay: document.getElementById("recording-overlay") as HTMLDivElement,
    verificationStatus: document.getElementById("verification-status") as HTMLDivElement,
    transcriptDisplay: document.getElementById("transcript-display") as HTMLDivElement,
    recordBtn: document.getElementById("record-btn") as HTMLButtonElement,
    toggleTypeBtn: document.getElementById("toggle-type-btn") as HTMLButtonElement,
    typeFallbackContainer: document.getElementById("type-fallback-container") as HTMLDivElement,
    typedPhraseInput: document.getElementById("typed-phrase-input") as HTMLTextAreaElement,
    verifyTypedBtn: document.getElementById("verify-typed-btn") as HTMLButtonElement,

    // Cloud Sync
    syncEnabled: document.getElementById("sync-enabled") as HTMLSelectElement,
    syncKeyInput: document.getElementById("sync-key-input") as HTMLInputElement,
    toggleKeyVisibilityBtn: document.getElementById("toggle-key-visibility-btn") as HTMLButtonElement,
    copySyncKeyBtn: document.getElementById("copy-sync-key-btn") as HTMLButtonElement,
    generateSyncKeyBtn: document.getElementById("generate-sync-key-btn") as HTMLButtonElement,
    syncServerUrl: document.getElementById("sync-server-url") as HTMLInputElement,
    syncNowBtn: document.getElementById("sync-now-btn") as HTMLButtonElement,
    syncStatusBadge: document.getElementById("sync-status-badge") as HTMLSpanElement,
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
  let currentTimeLimits: Record<string, number> = {};
  let currentDailyUsage: Record<string, Record<string, number>> = {};

  // 1. Enabled change with Cooldown protection (Issue #6)
  elements.enabled.addEventListener("change", (event) => {
    const desiredState = stringToBoolean(getEventTargetValue(event));

    if (!desiredState && currentDisableDelay > 0) {
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

  elements.scheduleEnabled.addEventListener("change", saveSchedule);
  elements.scheduleDays.forEach((cb) => cb.addEventListener("change", saveSchedule));
  elements.scheduleStart.addEventListener("change", saveSchedule);
  elements.scheduleEnd.addEventListener("change", saveSchedule);

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
  const openSyntaxModal = () => elements.syntaxModal.classList.remove("hidden");
  const closeSyntaxModal = () => elements.syntaxModal.classList.add("hidden");

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
    } else if (
      (e.key === "?" || (e.key === "/" && (e.ctrlKey || e.metaKey))) &&
      document.activeElement !== elements.blockedList &&
      document.activeElement !== elements.redirectUrl &&
      document.activeElement !== elements.limitDomain &&
      document.activeElement !== elements.challengePhrase
    ) {
      elements.syntaxModal.classList.toggle("hidden");
    }
  });

  // 11. What's New Dismiss (Issue #14)
  elements.dismissWhatsNew.addEventListener("click", () => {
    storage.set({ whatsNewDismissed: true });
    elements.whatsNewBanner.classList.add("hidden");
  });

  // 12. Fine Time Limits per Website
  const renderTimeLimitsTable = () => {
    const domains = Object.keys(currentTimeLimits);
    elements.timeLimitsTbody.textContent = "";

    if (domains.length === 0) {
      const emptyTr = document.createElement("tr");
      emptyTr.className = "empty-row";
      const emptyTd = document.createElement("td");
      emptyTd.colSpan = 4;
      emptyTd.textContent = "No site limits configured yet.";
      emptyTr.appendChild(emptyTd);
      elements.timeLimitsTbody.appendChild(emptyTr);
      return;
    }

    const todayKey = getTodayKey();
    const todayUsage = currentDailyUsage[todayKey] || {};

    domains.forEach((domain) => {
      const limitMinutes = currentTimeLimits[domain];
      const usedSeconds = todayUsage[domain] || 0;
      const usedMinutes = Math.floor(usedSeconds / 60);
      const percent = Math.min(100, Math.round((usedSeconds / (limitMinutes * 60)) * 100));

      let fillClass = "progress-fill";
      if (percent >= 100) fillClass += " danger";
      else if (percent >= 80) fillClass += " warning";

      const tr = document.createElement("tr");

      // Col 1: Domain
      const tdDomain = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = domain;
      tdDomain.appendChild(strong);
      tr.appendChild(tdDomain);

      // Col 2: Limit
      const tdLimit = document.createElement("td");
      tdLimit.textContent = `${limitMinutes} min / day`;
      tr.appendChild(tdLimit);

      // Col 3: Usage progress bar
      const tdUsage = document.createElement("td");
      const progressBar = document.createElement("div");
      progressBar.className = "usage-progress-bar";

      const track = document.createElement("div");
      track.className = "progress-track";

      const fill = document.createElement("div");
      fill.className = fillClass;
      fill.style.width = `${percent}%`;
      track.appendChild(fill);

      const span = document.createElement("span");
      span.textContent = `${usedMinutes}m / ${limitMinutes}m (${percent}%)`;

      progressBar.appendChild(track);
      progressBar.appendChild(span);
      tdUsage.appendChild(progressBar);
      tr.appendChild(tdUsage);

      // Col 4: Delete button
      const tdAction = document.createElement("td");
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger btn-small delete-limit-btn";
      deleteBtn.dataset.domain = domain;
      deleteBtn.textContent = "Delete";
      tdAction.appendChild(deleteBtn);
      tr.appendChild(tdAction);

      elements.timeLimitsTbody.appendChild(tr);
    });

    // Attach delete listeners (requires passing the Mirror of Accountability)
    elements.timeLimitsTbody.querySelectorAll<HTMLButtonElement>(".delete-limit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const domain = btn.dataset.domain;
        if (domain && currentTimeLimits[domain]) {
          openMirrorModalForDelete(domain);
        }
      });
    });
  };

  // Mirror of Accountability Challenge for deleting a Daily Time Limit row
  let pendingDeleteDomain: string | null = null;
  let currentStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let isRecording = false;
  let speechRecognitionInstance: ISpeechRecognition | null = null;
  let fallbackTranscript = "";

  const getActiveChallengeConfig = () => ({
    targetPhrase: elements.challengePhrase?.value.trim() || DEFAULTS.challengePhrase,
    requiredCount: Math.max(1, Number(elements.challengeRepeatCount?.value) || DEFAULTS.challengeRepeatCount),
    whisperUrl: elements.whisperServerUrl?.value.trim() || DEFAULTS.whisperServerUrl,
  });

  const checkModalWhisper = async () => {
    if (!elements.whisperModalStatus) return;
    const { whisperUrl } = getActiveChallengeConfig();
    try {
      const resp = await fetch(`${whisperUrl}/health`);
      if (resp.ok) {
        elements.whisperModalStatus.textContent = "🟢 MLX-Whisper Ready";
        elements.whisperModalStatus.className = "server-status-pill online";
      } else {
        throw new Error("HTTP error");
      }
    } catch {
      elements.whisperModalStatus.textContent = "⚠️ Whisper Server Offline";
      elements.whisperModalStatus.className = "server-status-pill offline";
      elements.whisperModalStatus.title = "Start Whisper via terminal: bash server/start.sh";
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (elements.mirrorVideo) {
        elements.mirrorVideo.srcObject = currentStream;
      }
    } catch {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (elements.mirrorVideo) {
          elements.mirrorVideo.srcObject = currentStream;
        }
      } catch {
        if (elements.verificationStatus) {
          elements.verificationStatus.textContent = "Camera/microphone access optional. You can still speak or type to verify.";
        }
      }
    }
  };

  const stopCamera = () => {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }
    if (speechRecognitionInstance) {
      try {
        speechRecognitionInstance.stop();
      } catch {
        // Ignore
      }
      speechRecognitionInstance = null;
    }
    isRecording = false;
    if (elements.recordBtn) {
      elements.recordBtn.textContent = "🎙️ Start Speaking";
      elements.recordBtn.classList.remove("btn-danger");
    }
    if (elements.recordingOverlay) {
      elements.recordingOverlay.classList.add("hidden");
    }
  };

  const closeMirrorModal = () => {
    stopCamera();
    pendingDeleteDomain = null;
    if (elements.mirrorModal) {
      elements.mirrorModal.classList.add("hidden");
    }
  };

  const openMirrorModalForDelete = async (domain: string) => {
    pendingDeleteDomain = domain;
    const { targetPhrase, requiredCount } = getActiveChallengeConfig();

    if (elements.mirrorTargetDomain) elements.mirrorTargetDomain.textContent = domain;
    if (elements.challengePhraseDisplay) elements.challengePhraseDisplay.textContent = `"${targetPhrase}"`;
    if (elements.requiredRepeatCount) elements.requiredRepeatCount.textContent = String(requiredCount);

    if (elements.verificationStatus) {
      elements.verificationStatus.className = "verification-status";
      elements.verificationStatus.textContent = "Click \"Start Speaking\" and repeat the phrase.";
    }
    if (elements.transcriptDisplay) {
      elements.transcriptDisplay.textContent = "";
      elements.transcriptDisplay.classList.add("hidden");
    }
    if (elements.typedPhraseInput) {
      elements.typedPhraseInput.value = "";
    }
    if (elements.typeFallbackContainer) {
      elements.typeFallbackContainer.classList.add("hidden");
    }

    if (elements.mirrorModal) {
      elements.mirrorModal.classList.remove("hidden");
      checkModalWhisper();
      await startCamera();
    }
  };

  if (elements.closeMirrorBtn) elements.closeMirrorBtn.addEventListener("click", closeMirrorModal);
  if (elements.cancelMirrorChallenge) elements.cancelMirrorChallenge.addEventListener("click", closeMirrorModal);

  const sendToWhisperServer = async (audioBlob: Blob): Promise<string> => {
    const { whisperUrl } = getActiveChallengeConfig();
    try {
      const resp = await fetch(`${whisperUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type || "audio/wav" },
        body: audioBlob,
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.text || "";
      }
    } catch {
      // Offline or network error
    }
    return "";
  };

  const handleMirrorVerificationResult = (transcript: string) => {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) {
      if (elements.verificationStatus) {
        elements.verificationStatus.className = "verification-status error";
        elements.verificationStatus.textContent = "No speech detected. Please speak clearly into your microphone or type below.";
      }
      return;
    }

    if (elements.transcriptDisplay) {
      elements.transcriptDisplay.textContent = `Heard: "${cleanTranscript}"`;
      elements.transcriptDisplay.classList.remove("hidden");
    }

    const { targetPhrase, requiredCount } = getActiveChallengeConfig();
    const verification = verifySpokenPhrase(cleanTranscript, targetPhrase, requiredCount);

    if (verification.verified) {
      if (elements.verificationStatus) {
        elements.verificationStatus.className = "verification-status success";
        elements.verificationStatus.textContent = `${verification.feedback} Removing limit...`;
      }

      const domainToDelete = pendingDeleteDomain;
      if (domainToDelete && currentTimeLimits[domainToDelete]) {
        const updated = { ...currentTimeLimits };
        delete updated[domainToDelete];
        storage.set({ timeLimits: updated });
      }

      closeMirrorModal();
    } else if (elements.verificationStatus) {
      elements.verificationStatus.className = "verification-status error";
      elements.verificationStatus.textContent = verification.feedback;
    }
  };

  const startRecording = async () => {
    audioChunks = [];
    fallbackTranscript = "";
    isRecording = true;

    if (elements.recordBtn) {
      elements.recordBtn.textContent = "⏹️ Stop & Verify";
      elements.recordBtn.classList.add("btn-danger");
    }
    if (elements.recordingOverlay) elements.recordingOverlay.classList.remove("hidden");
    if (elements.verificationStatus) {
      elements.verificationStatus.className = "verification-status";
      elements.verificationStatus.textContent = "Listening... repeat the phrase aloud now.";
    }

    const win = window as unknown as IWindow;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        speechRecognitionInstance = new SpeechRec();
        speechRecognitionInstance.continuous = true;
        speechRecognitionInstance.interimResults = false;
        speechRecognitionInstance.lang = "en-US";
        speechRecognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
          for (let i = 0; i < Object.keys(event.results).length; i++) {
            fallbackTranscript += " " + event.results[i][0].transcript;
          }
        };
        speechRecognitionInstance.start();
      } catch {
        // Fallback speech recognition not available
      }
    }

    try {
      let audioStream: MediaStream;
      if (currentStream && currentStream.getAudioTracks().length > 0) {
        audioStream = currentStream;
      } else {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      mediaRecorder = new MediaRecorder(audioStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      mediaRecorder.start();
    } catch {
      if (elements.verificationStatus) {
        elements.verificationStatus.className = "verification-status error";
        elements.verificationStatus.textContent = "Microphone unavailable. Please allow microphone permissions or use typing below.";
      }
    }
  };

  const stopRecordingAndVerify = async () => {
    isRecording = false;
    if (elements.recordBtn) {
      elements.recordBtn.textContent = "🎙️ Start Speaking";
      elements.recordBtn.classList.remove("btn-danger");
    }
    if (elements.recordingOverlay) elements.recordingOverlay.classList.add("hidden");

    if (speechRecognitionInstance) {
      try {
        speechRecognitionInstance.stop();
      } catch {
        // Ignore
      }
    }

    if (elements.verificationStatus) {
      elements.verificationStatus.textContent = "Transcribing with OpenAI Whisper...";
    }

    let finalTranscript = "";

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        if (!mediaRecorder) return resolve();
        mediaRecorder.onstop = () => resolve();
        mediaRecorder.stop();
      });

      const rawBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      let wavBlob: Blob = rawBlob;
      try {
        wavBlob = await convertBlobToWav(rawBlob);
      } catch {
        // Fallback to rawBlob
      }

      const whisperResult = await sendToWhisperServer(wavBlob);
      finalTranscript = (whisperResult || "").trim() || fallbackTranscript.trim();
    } else {
      finalTranscript = fallbackTranscript.trim();
    }

    handleMirrorVerificationResult(finalTranscript);
  };

  if (elements.recordBtn) {
    elements.recordBtn.addEventListener("click", () => {
      if (isRecording) {
        stopRecordingAndVerify();
      } else {
        startRecording();
      }
    });
  }

  if (elements.toggleTypeBtn && elements.typeFallbackContainer) {
    elements.toggleTypeBtn.addEventListener("click", () => {
      elements.typeFallbackContainer.classList.toggle("hidden");
    });
  }

  if (elements.verifyTypedBtn && elements.typedPhraseInput) {
    elements.verifyTypedBtn.addEventListener("click", () => {
      const typedText = elements.typedPhraseInput.value.trim();
      if (!typedText) {
        if (elements.verificationStatus) {
          elements.verificationStatus.className = "verification-status error";
          elements.verificationStatus.textContent = "Please type the confession phrase first.";
        }
        return;
      }
      handleMirrorVerificationResult(typedText);
    });
  }

  elements.setLimitBtn.addEventListener("click", () => {
    const rawDomain = elements.limitDomain.value.trim();
    const minutes = Number(elements.limitMinutes.value);

    if (!rawDomain) return;
    const norm = normalizeHost(rawDomain);
    const limitMin = isNaN(minutes) || minutes < 1 ? 15 : minutes;

    const updated = { ...currentTimeLimits, [norm]: limitMin };
    storage.set({ timeLimits: updated }).then(() => {
      elements.limitDomain.value = "";
      elements.limitMinutes.value = "";
    });
  });

  // 13. Mirror of Accountability & Whisper Server Settings
  elements.challengePhrase.addEventListener("input", (e) => {
    const challengePhrase = (e.target as HTMLInputElement).value;
    storage.set({ challengePhrase });
  });

  elements.challengeRepeatCount.addEventListener("change", (e) => {
    const challengeRepeatCount = Math.max(1, Number((e.target as HTMLInputElement).value));
    storage.set({ challengeRepeatCount });
  });

  elements.whisperServerUrl.addEventListener("input", (e) => {
    const whisperServerUrl = (e.target as HTMLInputElement).value.trim();
    storage.set({ whisperServerUrl });
  });

  const checkWhisperHealth = async (url: string) => {
    elements.whisperStatusBadge.textContent = "Connecting...";
    elements.whisperStatusBadge.className = "badge paused";

    try {
      const resp = await fetch(`${url}/health`, { method: "GET" });
      if (resp.ok) {
        elements.whisperStatusBadge.textContent = "🟢 Online (MLX-Whisper)";
        elements.whisperStatusBadge.className = "badge";
      } else {
        throw new Error("HTTP error");
      }
    } catch {
      elements.whisperStatusBadge.textContent = "⚪ Offline (Web Speech Fallback)";
      elements.whisperStatusBadge.className = "badge inactive";
    }
  };

  elements.testWhisperBtn.addEventListener("click", () => {
    checkWhisperHealth(elements.whisperServerUrl.value.trim() || "http://127.0.0.1:8765");
  });

  // 14. Cloud Sync Settings
  elements.syncEnabled.addEventListener("change", (e) => {
    const isSyncEnabled = stringToBoolean(getEventTargetValue(e));
    document.body.classList.toggle("sync-enabled", isSyncEnabled);
    if (isSyncEnabled && !elements.syncKeyInput.value.trim()) {
      const newKey = generateSyncKey();
      elements.syncKeyInput.value = newKey;
      storage.set({ syncEnabled: true, syncKey: newKey });
    } else {
      storage.set({ syncEnabled: isSyncEnabled });
    }
  });

  elements.syncKeyInput.addEventListener("change", (e) => {
    const syncKey = (e.target as HTMLInputElement).value.trim();
    storage.set({ syncKey });
  });

  elements.toggleKeyVisibilityBtn.addEventListener("click", () => {
    if (elements.syncKeyInput.type === "password") {
      elements.syncKeyInput.type = "text";
      elements.toggleKeyVisibilityBtn.textContent = "🙈 Hide";
    } else {
      elements.syncKeyInput.type = "password";
      elements.toggleKeyVisibilityBtn.textContent = "👁 Show";
    }
  });

  elements.copySyncKeyBtn.addEventListener("click", async () => {
    const key = elements.syncKeyInput.value.trim();
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      const originalText = elements.copySyncKeyBtn.textContent;
      elements.copySyncKeyBtn.textContent = "✅ Copied!";
      setTimeout(() => {
        elements.copySyncKeyBtn.textContent = originalText;
      }, 2000);
    } catch {
      elements.syncKeyInput.select();
      document.execCommand("copy");
    }
  });

  elements.generateSyncKeyBtn.addEventListener("click", () => {
    if (
      elements.syncKeyInput.value.trim()
      && !confirm("Generating a new key unlinks this browser from other browsers unless you copy it there. Generate anyway?")
    ) {
      return;
    }
    const newKey = generateSyncKey();
    elements.syncKeyInput.value = newKey;
    storage.set({ syncKey: newKey });
  });

  elements.syncServerUrl.addEventListener("change", (e) => {
    const syncServerUrl = (e.target as HTMLInputElement).value.trim() || "http://127.0.0.1:8765/sync";
    storage.set({ syncServerUrl });
  });

  const performManualSync = async () => {
    const key = elements.syncKeyInput.value.trim();
    const serverUrl = elements.syncServerUrl.value.trim() || "http://127.0.0.1:8765/sync";

    if (!key) {
      elements.syncStatusBadge.textContent = "⚠️ No Sync Key set";
      elements.syncStatusBadge.className = "badge paused";
      return;
    }

    elements.syncStatusBadge.textContent = "⏳ Syncing...";
    elements.syncStatusBadge.className = "badge paused";

    const allLocal = await storage.getAll();
    const pullRes = await pullSync(key, serverUrl);

    if (!pullRes.ok) {
      elements.syncStatusBadge.textContent = `🔴 Failed: ${pullRes.error || "Connection error"}`;
      elements.syncStatusBadge.className = "badge inactive";
      return;
    }

    const localLastSynced = allLocal.lastSyncedAt || 0;
    const remoteData = pullRes.data;

    if (remoteData && remoteData.updatedAt > localLastSynced) {
      // Remote is newer, apply to local
      await storage.set({
        blocked: remoteData.blocked,
        mode: remoteData.mode,
        timeLimits: remoteData.timeLimits,
        challengePhrase: remoteData.challengePhrase,
        challengeRepeatCount: remoteData.challengeRepeatCount,
        schedule: remoteData.schedule,
        resolution: remoteData.resolution,
        redirectUrl: remoteData.redirectUrl,
        disableDelay: remoteData.disableDelay,
        blockByTitle: remoteData.blockByTitle,
        lastSyncedAt: remoteData.updatedAt,
      });
      elements.syncStatusBadge.textContent = "🟢 Pulled from cloud";
      elements.syncStatusBadge.className = "badge";
    } else {
      // Local is newer or remote is empty, push local to remote
      const payload = extractSyncPayload(allLocal);
      const pushRes = await pushSync(key, serverUrl, payload);
      if (pushRes.ok) {
        await storage.set({ lastSyncedAt: payload.updatedAt });
        elements.syncStatusBadge.textContent = "🟢 Pushed to cloud";
        elements.syncStatusBadge.className = "badge";
      } else {
        elements.syncStatusBadge.textContent = `🔴 Push failed: ${pushRes.error || "Unknown"}`;
        elements.syncStatusBadge.className = "badge inactive";
      }
    }
  };

  elements.syncNowBtn.addEventListener("click", () => {
    performManualSync();
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

    if (items.timeLimits !== undefined) {
      currentTimeLimits = items.timeLimits || {};
      renderTimeLimitsTable();
    }

    if (items.dailyUsage !== undefined) {
      currentDailyUsage = items.dailyUsage || {};
      renderTimeLimitsTable();
    }

    if (items.challengePhrase !== undefined) {
      elements.challengePhrase.value = items.challengePhrase;
    }

    if (items.challengeRepeatCount !== undefined) {
      elements.challengeRepeatCount.value = String(items.challengeRepeatCount);
    }

    if (items.whisperServerUrl !== undefined) {
      elements.whisperServerUrl.value = items.whisperServerUrl;
      checkWhisperHealth(items.whisperServerUrl);
    }

    if (items.syncEnabled !== undefined) {
      elements.syncEnabled.value = booleanToString(items.syncEnabled);
      document.body.classList.toggle("sync-enabled", items.syncEnabled);
    }

    if (items.syncKey !== undefined) {
      elements.syncKeyInput.value = items.syncKey;
    }

    if (items.syncServerUrl !== undefined) {
      elements.syncServerUrl.value = items.syncServerUrl;
    }

    if (items.lastSyncedAt !== undefined) {
      if (items.lastSyncedAt) {
        const timeStr = new Date(items.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        elements.syncStatusBadge.textContent = `🟢 Synced (${timeStr})`;
        elements.syncStatusBadge.className = "badge";
      } else {
        elements.syncStatusBadge.textContent = "Not synced";
        elements.syncStatusBadge.className = "badge inactive";
      }
    }
  };

  return { elements, init };
})();

window.addEventListener("DOMContentLoaded", () => {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) {
    UI.init({
      ...DEFAULTS,
      timeLimits: { "reddit.com": 30, "youtube.com": 45 },
      dailyUsage: { [getTodayKey()]: { "reddit.com": 12 * 60, "youtube.com": 36 * 60 } },
    });
    document.body.classList.add("ready");
    return;
  }

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
    "timeLimits",
    "dailyUsage",
    "siteExtensions",
    "challengePhrase",
    "challengeRepeatCount",
    "whisperServerUrl",
    "syncEnabled",
    "syncKey",
    "syncServerUrl",
    "lastSyncedAt",
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
