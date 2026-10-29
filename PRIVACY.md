# Privacy Policy for ScrollTax

**Effective Date:** October 29, 2026

ScrollTax ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy outlines how your information is handled when using our browser extension.

## 1. No Data Collection or Tracking
ScrollTax does not collect, record, transmit, share, or sell any personal data, browsing history, user credentials, or IP addresses.

## 2. Local Browser Storage
All configuration settings and application data are stored strictly on your local device using `chrome.storage.local`. This includes:
- Your custom website blocking rules and whitelist configurations.
- Daily time limits per website and today's accumulated browsing minutes.
- Blocking schedules (work/study hours).
- The Mirror of Accountability settings (custom phrase and required repetition count).
- Temporary snooze and site extension timestamps.

This information is never transmitted to any external server and is erased when the extension is uninstalled.

## 3. Web Navigation & Tabs
The extension listens to local browser navigation events solely to evaluate whether the active URL matches your configured blocking rules or daily time limits. URLs are evaluated in real-time in local memory and are never logged or stored.

## 4. Camera and Microphone Usage
When you participate in the optional **Mirror of Accountability** challenge:
- **Camera Feed**: Used exclusively to provide a live, mirrored reflection on your screen. The video stream is never recorded, captured, or transmitted off your machine.
- **Microphone & Speech Transcription**: Audio input is captured only while the speech verification is active and is transcribed either via a local on-device model (such as an Apple Silicon MLX-Whisper server on `127.0.0.1`) or the browser's built-in speech recognition API. Audio is never saved, uploaded, or transmitted to any external cloud service.

## 5. Third-Party Services & Ads
ScrollTax contains no advertising, tracking pixels, or third-party analytical SDKs.

## 6. Open Source & Transparency
ScrollTax is open source. You can inspect the source code and verify our privacy practices at:
https://github.com/Nikhil-Mundhra/Web-Blocker

## 7. Contact & Inquiries
For questions regarding this policy or the extension, please open an issue on our GitHub repository:
https://github.com/Nikhil-Mundhra/Web-Blocker/issues
