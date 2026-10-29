# Chrome Web Store Listing — ScrollTax

> Last Updated: 2026-10-29

This document serves as the single source of truth for publishing **ScrollTax** to the **Google Chrome Web Store** and other extension marketplaces (Firefox Add-ons, Microsoft Edge Add-ons).

---

## 📋 Store Listing Metadata

**Extension Name** [REQUIRED]
```text
ScrollTax
```
*(Matches `manifest.json`. Length: 9 chars / max 75).*

**Short Description** [REQUIRED]
```text
Put a tax on doomscrolling. Set daily time budgets, enforce website blocks, and hold yourself accountable.
```
*(Length: 107 chars / max 132 chars).*

**Detailed Description** [REQUIRED]
```text
ScrollTax puts a tax on doomscrolling — helping you enforce healthy digital habits, budget your time on distracting websites, and stay focused on what truly matters.

KEY FEATURES
• Daily Time Limits: Set custom daily minute allowances for specific websites (e.g., 20 minutes on social feeds, 30 minutes on video platforms). A clean progress bar shows your active browsing time in real-time.
• The Mirror of Accountability: Need an extension on a blocked site? Break autopilot habits by catching a randomly moving button, then face yourself in a live video mirror while verbally repeating your custom accountability phrase.
• Speech-to-Text Verification: Verifies that you spoke your custom accountability phrase aloud before unlocking temporary time extensions (+1m, +5m, or +20m).
• Block Schedules: Automatically block distracting websites during your work or study hours (e.g., Mon–Fri, 9:00 AM – 5:00 PM), with full support for overnight shifts.
• Whitelist Mode: High-focus mode that blocks all websites except those on your explicitly approved list.
• Flexible Resolutions: Choose whether blocked websites show the informative Blocked Page, automatically close the tab, or redirect to a productive URL.
• Focus Lock & Cooldowns: Prevent impulsive disabling with a timed lock and countdown timer.
• Quick Action Toolbar Popup: Instantly block a site, whitelist an address, or snooze blocking directly from your browser toolbar.

HOW TO USE SCROLLTAX
1. Click the ScrollTax icon in your toolbar to block distracting websites with a single click.
2. Open Options to configure your daily time budgets, scheduled blocking hours, and your custom accountability phrase.
3. When a site is blocked or your daily budget expires, reflect on your goals or take on the Mirror of Accountability challenge for a short extension.

PRIVACY & ON-DEVICE PROCESSING
ScrollTax respects your privacy. All blocking rules, time tracking statistics, and settings are stored locally on your device. Audio recorded during the Mirror challenge is processed either locally on your machine or directly in your browser. No browsing data, personal information, or audio recordings are ever transmitted or sold to third parties.

SUPPORT & FEEDBACK
Questions, feature suggestions, or feedback? Visit our project repository on GitHub:
https://github.com/Nikhil-Mundhra/Web-Blocker
```

**Category** [REQUIRED]
```text
Productivity
```

**Single Purpose** [REQUIRED]
```text
Enforces custom daily website time limits and blocking rules to prevent digital distractions and doomscrolling.
```

**Primary Language** [REQUIRED]
```text
English
```

---

## 🎨 Graphics & Assets

| Asset | Dimensions | Status | Location | Notes |
|---|---|---|---|---|
| **Store Icon** [REQUIRED] | 128×128 PNG | ✅ Ready | `public/icon_128.png` | Hi-res app icon |
| **Screenshot 1** [REQUIRED] | 1280×800 PNG | 🟡 Needs capture | `store-assets/screenshot-1.png` | Toolbar popup blocking a distracting site |
| **Screenshot 2** [RECOMMENDED] | 1280×800 PNG | 🟡 Needs capture | `store-assets/screenshot-2.png` | Daily Time Limits table with progress bars in Options |
| **Screenshot 3** [RECOMMENDED] | 1280×800 PNG | 🟡 Needs capture | `store-assets/screenshot-3.png` | The Mirror of Accountability challenge with video mirror |
| **Screenshot 4** [RECOMMENDED] | 1280×800 PNG | 🟡 Needs capture | `store-assets/screenshot-4.png` | Blocked page featuring the randomly moving button |
| **Small Promo Tile** [RECOMMENDED] | 440×280 PNG | 🟡 Needs capture | `store-assets/promo-small.png` | For store search tile & category features |
| **Marquee Promo Tile** | 1400×560 PNG | ⬜ Optional | `store-assets/promo-marquee.png` | Large hero banner for Chrome Web Store spotlight |

---

## 🔑 Permissions Justification

*These exact plain-English explanations should be entered into the Chrome Developer Dashboard for each declared permission:*

| Permission | Type | Plain-English Justification for Reviewers |
|---|---|---|
| `storage` | `permissions` | Needed to store user settings, blocking rules, schedule hours, per-website daily time budgets, and temporary snooze/extension states locally on the user's device. |
| `tabs` | `permissions` | Needed to inspect the active tab's domain to match against user-defined blocking rules and calculate daily browsing time, and to close or redirect tabs when rules are triggered. |
| `webNavigation` | `permissions` | Needed to detect navigation events (`onBeforeNavigate`) so blocked websites can be redirected to the blocked notice immediately before the page starts rendering. |
| `contextMenus` | `permissions` | Needed to add "Block this page only" and "Block entire website" items to the browser's right-click context menu, allowing users to quickly block distractions without leaving the page. |

> **Host Permissions Note**: ScrollTax does **NOT** request `<all_urls>` or broad host permissions. This minimizes review scrutiny and ensures fast-track approval.

---

## 🔒 Privacy & Data Use Disclosure

*These responses map directly to the Chrome Web Store Data Safety questionnaire:*

### Data Collection Checklist
- **Personally Identifiable Information (PII)**: No
- **Health Info**: No
- **Financial Info**: No
- **Authentication Info**: No
- **Personal Communications**: No
- **Location**: No
- **Web History**: No (URLs are evaluated only in real-time memory against local user rules and discarded; browsing history is never recorded or transmitted)
- **User Activity**: No
- **Website Content**: No

### Data Use Certification
- [x] Data is **NOT** sold to third parties.
- [x] Data is **NOT** used for purposes unrelated to the extension's single purpose.
- [x] Data is **NOT** used for creditworthiness, lending, or advertising profiling.

---

## 📜 Privacy Policy Document

*The Chrome Web Store requires a publicly accessible URL for the privacy policy. You can host this in your GitHub repository (e.g. `https://nikhilmundhra.github.io/Web-Blocker/privacy` or directly in the repository).*

```markdown
# Privacy Policy for ScrollTax

**Effective Date:** October 29, 2026

ScrollTax ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains our data practices.

### 1. No Data Collection or Transmission
ScrollTax does not collect, track, transmit, or sell any personal information, browsing history, or user activity. All operations take place strictly on your local device.

### 2. Local Storage
The extension uses your browser's local storage (`chrome.storage.local`) exclusively to save:
- Your blocking rules and allowed lists
- Your daily time limits and daily usage minutes
- Your schedule preferences
- Your custom accountability challenge phrase and repetition settings

This data never leaves your device and is deleted when you uninstall the extension.

### 3. Camera and Microphone Access
When you choose to request a time extension via the Mirror of Accountability:
- The video stream is mirrored live in your browser window to display a local reflection. The video is never recorded, captured, or transmitted.
- Audio recorded during speech verification is transcribed either locally on your machine (via the local Apple Silicon MLX-Whisper server) or using the browser's on-device speech recognition. No audio is ever stored or uploaded to external cloud servers.

### 4. Third-Party Services
ScrollTax does not embed third-party analytics, tracking pixels, advertising networks, or external cloud SDKs.

### 5. Contact
For any questions regarding this Privacy Policy, please open an issue at:
https://github.com/Nikhil-Mundhra/Web-Blocker
```

---

## 🚀 Step-by-Step Store Launch Guides

### 1. Google Chrome Web Store (CWS)
1. **Register as a Chrome Web Store Developer**:
   - Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   - Sign in with your Google account and pay the one-time \$5 registration fee.
2. **Build the Production Package**:
   - Run: `npm run package:chrome`
   - This generates a clean, optimized `scroll-tax-chrome.zip` in the project root with `manifest.json` at the root.
3. **Upload the Package**:
   - In the Developer Dashboard, click **Add new item**.
   - Upload `scroll-tax-chrome.zip`.
4. **Complete the Store Listing**:
   - Fill in **Name**, **Short Description**, and **Detailed Description** using the text above.
   - Select category: **Productivity**.
   - Upload **Icon** (`public/icon_128.png`) and at least 1 **Screenshot** (1280×800).
5. **Fill in Privacy & Permissions**:
   - Paste the justifications from the table above for `storage`, `tabs`, `webNavigation`, and `contextMenus`.
   - Complete the Data Safety questionnaire (select "No" to data collection).
   - Provide your hosted Privacy Policy URL.
6. **Submit for Review**:
   - Click **Submit for Review**. Review typically takes between 24 and 72 hours.

---

### 2. Firefox Browser Add-ons (AMO)
1. **Register Developer Account**:
   - Go to [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/).
   - Sign in or create a Firefox account (free).
2. **Build the Firefox Package**:
   - Run: `npm run package:firefox`
   - This generates `scroll-tax-firefox.zip` configured with gecko ID `{7C4E2B91-3A6D-4F08-9B5E-2D8A1C6F3E74}`.
3. **Submit Add-on**:
   - Click **Submit a New Add-on** -> Choose **On this site**.
   - Upload `scroll-tax-firefox.zip`.
   - Firefox automated linter will analyze the bundle.
4. **Provide Source Code Notice**:
   - Because code is compiled with TypeScript/tsup, Mozilla may prompt: *"Does your add-on use minified, concatenated or generated code?"*
   - Select **Yes** and upload a zip of your source repository (`src/`, `package.json`, `tsup.config.ts`), noting:
     `"Built with: npm run build"`
5. **Submit**:
   - Review typically takes 24 hours.

---

### 3. Microsoft Edge Add-ons
1. **Register Developer Account**:
   - Go to [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview).
   - Sign in with a Microsoft account (free registration).
2. **Submit Chrome Package**:
   - Microsoft Edge is Chromium-based and directly accepts `scroll-tax-chrome.zip`.
   - Click **Create new extension** and upload `scroll-tax-chrome.zip`.
   - Copy-paste the metadata and descriptions from this document.
3. **Submit**:
   - Edge review typically takes 1–3 business days.
