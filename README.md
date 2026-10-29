# ScrollTax

**ScrollTax** is a simple **Chrome/Firefox extension** that puts a tax on doomscrolling — block access to distracting websites and take back your attention.

## Icon

<img src="public/icon_128.png" width="48">

<img src="public/toolbar/light.png" width="480">
<img src="public/toolbar/dark.png" width="480">

## Features

- **Quick Action Popup**: Click the extension icon in the toolbar to immediately block the current page or domain, or take a quick break.
- **Whitelist Mode (Approved Sites Only)**: Strict productivity mode that blocks all websites except those on your allowed list.
- **Block Schedule**: Automatically enforce blocking during work hours or study times (e.g., Mon–Fri, 9:00 AM – 5:00 PM), with overnight support.
- **Flexible Resolutions**: Choose between **Close Tab**, **Show Blocked Info Page**, or **Redirect to Custom URL**.
- **Temporary Break / Snooze**: Need 1 or 5 minutes of access? Snooze blocking temporarily from the toolbar popup or blocked page with automatic resumption.
- **Focus Lock & Disable Cooldown**: Prevent impulsive overrides with a disable countdown timer and timed settings lock.
- **Advanced Pattern Matching**: Full support for wildcards (`*`, `?`), query string escaping (`\?`), regex rules (`/.../`), and tab title matching (`title:*shorts*`).

## Usage

Click on the toolbar icon to view active site details, block sites, or open Options.

### Rule Syntax & Special Characters

```
!           ⇒ prepend to allow / exclude from blocking
*           ⇒ match zero or more characters (e.g. *.example.com/* or *watch*)
?           ⇒ match any single character (e.g. example.com/???/)
\?          ⇒ match literal question mark (e.g. youtube.com/watch\?v=*)
/pattern/   ⇒ standard regular expression (e.g. /.{3,}\.example\.com/)
title:      ⇒ match tab / window title (e.g. title:*Shorts*)
```

### Examples

```
example.com              # Blocks example.com/ and any page on it
example.com/             # Blocks example.com/ ONLY
example.com/*            # Blocks example.com/ and any page on it

example.com/*            # Blocks any page on example.com/
!example.com/orange/     # except example.com/orange/

*.example.com/           # Blocks any subdomain of example.com/
!apple.example.com/      # except apple.example.com/

*watch*                  # Blocks any page containing word "watch"
youtube.com/watch\?v=*   # Blocks specific query strings with literal \?
/.{3,}\.example\.com/    # Blocks subdomains with 3 or more chars via regex
title:*shorts*           # Blocks pages with "shorts" in the tab title
```

### Modes

- **Blocklist Mode (Default)**: Normal browsing; only websites matching blocking rules are blocked.
- **Approved Sites Only (Whitelist Mode)**: All websites are blocked except rules prefixed with `!` (e.g. `!github.com`).

### Context menu

If enabled, ScrollTax will be added to your browser's context menu. It will offer options to:
- Block this page only
- Block entire website

## Privacy notice

ScrollTax doesn't collect any personal information or data.
All settings, rules, and counters are stored locally in your browser.