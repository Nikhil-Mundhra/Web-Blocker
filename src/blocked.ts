import storage, { VALIDATORS, CounterPeriod } from "./storage";
import { normalizeHost } from "./helpers/time-limits";
import { verifySpokenPhrase } from "./helpers/verify-phrase";

// Minimal browser speech recognition interface
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

window.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);

  const url = params.get("url");
  if (!url) {
    return;
  }

  const rule = params.get("rule");
  if (!rule) {
    return;
  }

  const count = parseInt(params.get("count") || "");
  const period = params.get("period");
  const countParams = (!isNaN(count) && VALIDATORS.counterPeriod(period))
    ? { count, period: period as CounterPeriod }
    : undefined;

  const messageEl = document.getElementById("message") as HTMLParagraphElement | null;
  if (messageEl) {
    messageEl.textContent = "";

    const urlSpan = document.createElement("span");
    urlSpan.id = "url";
    urlSpan.textContent = url;

    const boldEl = document.createElement("b");
    boldEl.textContent = " was blocked";

    const ruleSpan = document.createElement("span");
    ruleSpan.id = "rule";
    ruleSpan.textContent = rule;

    messageEl.appendChild(urlSpan);
    messageEl.appendChild(boldEl);
    messageEl.appendChild(document.createTextNode(" by "));
    messageEl.appendChild(ruleSpan);

    if (countParams) {
      const periodStrings: Record<CounterPeriod, string> = {
        ALL_TIME: "overall",
        THIS_MONTH: "this month",
        THIS_WEEK: "this week",
        TODAY: "today",
      };
      const countText = ` (${countParams.count}x ${periodStrings[countParams.period]})`;
      messageEl.appendChild(document.createTextNode(countText));
    }
  }

  // 1. One-minute snooze button
  const snoozeBtn = document.getElementById("snooze-btn") as HTMLButtonElement | null;
  if (snoozeBtn) {
    snoozeBtn.addEventListener("click", () => {
      const oneMinuteFromNow = Date.now() + 60 * 1000;
      storage.set({ pausedUntil: oneMinuteFromNow }).then(() => {
        window.location.href = url;
      });
    });
  }

  // 2. The Randomly Moving Button
  const catchMeBtn = document.getElementById("catch-me-btn") as HTMLButtonElement | null;
  const mirrorModal = document.getElementById("mirror-modal") as HTMLDivElement | null;
  const closeMirrorBtn = document.getElementById("close-mirror-btn") as HTMLButtonElement | null;
  const cancelMirrorChallenge = document.getElementById("cancel-mirror-challenge") as HTMLButtonElement | null;

  const phraseDisplay = document.getElementById("challenge-phrase-display") as HTMLDivElement | null;
  const repeatCountEl = document.getElementById("required-repeat-count") as HTMLElement | null;
  const mirrorVideo = document.getElementById("mirror-video") as HTMLVideoElement | null;
  const recordingOverlay = document.getElementById("recording-overlay") as HTMLDivElement | null;
  const verificationStatus = document.getElementById("verification-status") as HTMLDivElement | null;
  const transcriptDisplay = document.getElementById("transcript-display") as HTMLDivElement | null;
  const recordBtn = document.getElementById("record-btn") as HTMLButtonElement | null;

  const challengeSection = document.getElementById("mirror-challenge-section") as HTMLDivElement | null;
  const extensionScreen = document.getElementById("extension-screen") as HTMLDivElement | null;

  let currentStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let isRecording = false;
  let speechRecognitionInstance: ISpeechRecognition | null = null;
  let fallbackTranscript = "";

  const config = await storage.get([
    "challengePhrase",
    "challengeRepeatCount",
    "whisperServerUrl",
    "siteExtensions",
  ]);

  const targetPhrase = config.challengePhrase || "I am wasting my time and I need to get back to work";
  const requiredCount = config.challengeRepeatCount || 3;
  const whisperUrl = config.whisperServerUrl || "http://127.0.0.1:8765";

  if (phraseDisplay) phraseDisplay.textContent = `"${targetPhrase}"`;
  if (repeatCountEl) repeatCountEl.textContent = String(requiredCount);

  // Jump logic for the randomly moving button
  const moveButtonRandomly = () => {
    if (!catchMeBtn) return;
    const padding = 40;
    const btnWidth = catchMeBtn.offsetWidth || 220;
    const btnHeight = catchMeBtn.offsetHeight || 50;

    const maxLeft = Math.max(padding, window.innerWidth - btnWidth - padding);
    const maxTop = Math.max(padding, window.innerHeight - btnHeight - padding);

    const randomLeft = Math.floor(Math.random() * maxLeft);
    const randomTop = Math.floor(Math.random() * maxTop);

    catchMeBtn.style.bottom = "auto";
    catchMeBtn.style.right = "auto";
    catchMeBtn.style.left = `${randomLeft}px`;
    catchMeBtn.style.top = `${randomTop}px`;
  };

  if (catchMeBtn) {
    catchMeBtn.addEventListener("mouseenter", moveButtonRandomly);
    catchMeBtn.addEventListener("mousemove", moveButtonRandomly);

    catchMeBtn.addEventListener("click", async () => {
      if (mirrorModal) {
        mirrorModal.classList.remove("hidden");
        await startCamera();
      }
    });
  }

  // 3. Mirror & Camera feed
  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (mirrorVideo) {
        mirrorVideo.srcObject = currentStream;
      }
    } catch {
      if (verificationStatus) {
        verificationStatus.textContent = "Camera/microphone access optional. You can still speak to verify.";
      }
    }
  };

  const stopCamera = () => {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }
  };

  const closeModal = () => {
    stopCamera();
    if (mirrorModal) {
      mirrorModal.classList.add("hidden");
    }
  };

  if (closeMirrorBtn) closeMirrorBtn.addEventListener("click", closeModal);
  if (cancelMirrorChallenge) cancelMirrorChallenge.addEventListener("click", closeModal);

  // 4. Audio Recording & Speech-to-Text with local MLX Whisper
  const sendToWhisperServer = async (audioBlob: Blob): Promise<string> => {
    try {
      const resp = await fetch(`${whisperUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type || "audio/webm" },
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

  const startRecording = async () => {
    audioChunks = [];
    fallbackTranscript = "";
    isRecording = true;

    if (recordBtn) {
      recordBtn.textContent = "⏹️ Stop & Verify";
      recordBtn.classList.add("btn-danger");
    }
    if (recordingOverlay) recordingOverlay.classList.remove("hidden");
    if (verificationStatus) {
      verificationStatus.className = "verification-status";
      verificationStatus.textContent = "Listening... repeat the phrase now.";
    }

    // Set up Web Speech API as simultaneous fallback
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
      const audioStream = currentStream || await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(audioStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      mediaRecorder.start();
    } catch {
      // Audio capture error
    }
  };

  const stopRecordingAndVerify = async () => {
    isRecording = false;
    if (recordBtn) {
      recordBtn.textContent = "🎙️ Start Speaking";
      recordBtn.classList.remove("btn-danger");
    }
    if (recordingOverlay) recordingOverlay.classList.add("hidden");

    if (speechRecognitionInstance) {
      try {
        speechRecognitionInstance.stop();
      } catch {
        // Ignore
      }
    }

    if (verificationStatus) {
      verificationStatus.textContent = "Transcribing with OpenAI Whisper...";
    }

    let finalTranscript = "";

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        if (!mediaRecorder) return resolve();
        mediaRecorder.onstop = () => resolve();
        mediaRecorder.stop();
      });

      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const whisperResult = await sendToWhisperServer(audioBlob);
      finalTranscript = whisperResult || fallbackTranscript;
    } else {
      finalTranscript = fallbackTranscript;
    }

    if (!finalTranscript.trim()) {
      if (verificationStatus) {
        verificationStatus.className = "verification-status error";
        verificationStatus.textContent = "No speech detected. Please check microphone permissions and try again.";
      }
      return;
    }

    if (transcriptDisplay) {
      transcriptDisplay.textContent = `Heard: "${finalTranscript.trim()}"`;
      transcriptDisplay.classList.remove("hidden");
    }

    const verification = verifySpokenPhrase(finalTranscript, targetPhrase, requiredCount);

    if (verification.verified) {
      if (verificationStatus) {
        verificationStatus.className = "verification-status success";
        verificationStatus.textContent = verification.feedback;
      }

      // Transition to Extension Options screen
      setTimeout(() => {
        if (challengeSection) challengeSection.classList.add("hidden");
        if (extensionScreen) extensionScreen.classList.remove("hidden");
      }, 700);
    } else {
      if (verificationStatus) {
        verificationStatus.className = "verification-status error";
        verificationStatus.textContent = verification.feedback;
      }
    }
  };

  if (recordBtn) {
    recordBtn.addEventListener("click", () => {
      if (isRecording) {
        stopRecordingAndVerify();
      } else {
        startRecording();
      }
    });
  }

  // 5. Granting Time Increases (+1m, +5m, +20m)
  const extensionButtons = document.querySelectorAll<HTMLButtonElement>(".btn-ext");
  extensionButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const minutes = Number(btn.dataset.minutes) || 5;
      const host = normalizeHost(url);
      const extensionUntil = Date.now() + minutes * 60 * 1000;

      const { siteExtensions = {} } = await storage.get(["siteExtensions"]);
      const updatedExtensions = { ...siteExtensions, [host]: extensionUntil };

      await storage.set({ siteExtensions: updatedExtensions });

      stopCamera();
      window.location.href = url;
    });
  });

  document.body.classList.add("ready");
});
