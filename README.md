# Super Tab Out

English · [简体中文](./README.zh-CN.md)

**A polished local new-tab command center for Chromium browsers.**

Super Tab Out replaces the default new tab page with a visual dashboard for your open tabs. It groups tabs by domain or by Chrome Tab Groups, protects pinned tabs, gives you fast search, privacy mode, bilingual UI, and a richer theme picker.

No server. No account. No telemetry. No build step. Load the `extension/` folder and use it.

---

## Highlights

- **Two ways to organize tabs**: switch between domain grouping and Chrome's native Tab Groups.
- **Fast tab search**: press `/` and filter cards, chips, URLs, and group names in real time.
- **Privacy mode for screen sharing**: click the lock or press `Esc` to hide the tab dashboard behind a clean clock/search screen.
- **Pinned tabs are protected**: pinned tabs are excluded from cards, counts, duplicate cleanup, and bulk-close actions.
- **One-click duplicate cleanup**: repeated URLs are marked and can be cleaned while keeping one copy.
- **Save for later**: stash a tab into a local checklist before closing it.
- **Auto-refresh**: tab open, close, navigation, and group changes refresh the dashboard automatically.
- **Bilingual UI**: switch between English and Simplified Chinese from the top-right control.
- **More themes, easier switching**: choose from 10 built-in palettes with a larger theme picker.
- **Local-first privacy posture**: settings and saved tabs stay on your machine.

---

## Screens and Controls

The top-right controls are intentionally compact:

- **Lock**: toggles privacy mode.
- **EN / 中**: switches the fixed UI labels between English and Simplified Chinese.
- **Theme picker**: opens a palette menu with 10 themes.

Available themes:

| Theme | Tone |
| --- | --- |
| Warm paper | Soft editorial paper |
| Midnight | Dark, quiet workspace |
| Arctic frost | Crisp blue-white |
| Forest canopy | Muted green and earth |
| Graphite gold | Dark graphite with gold accents |
| Coast coral | Coastal teal with coral |
| Plum studio | Low-saturation plum |
| Matcha desk | Calm green reading mode |
| Ember slate | Dark slate with warm energy |
| Lavender mint | Light lavender with mint |

---

## Install

1. Clone the repo:

```bash
git clone https://github.com/SivanZeroX/super-tab-out.git
cd super-tab-out
```

2. Open your browser extension page:

```text
chrome://extensions
edge://extensions
brave://extensions
```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension/` folder in this repo.
6. Open a new tab.

To update later, pull the latest code and click **Reload** on the extension page:

```bash
git pull
```

---

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus the open-tabs search field |
| `Esc` while search is focused | Clear and blur search |
| `Esc` elsewhere | Toggle privacy mode |
| `Ctrl/Cmd + Shift + G` | Toggle Groups / Domains view |

---

## Feature Details

### Tab Dashboard

Super Tab Out reads your open tabs with `chrome.tabs.query({})`, filters out browser-internal pages, and renders useful cards:

- domain cards for normal browsing
- a Homepages card for landing pages like Gmail, X, YouTube, LinkedIn, and GitHub
- optional Chrome Tab Groups view
- duplicate badges for repeated URLs
- localhost labels with port numbers

### Closing Behavior

The extension uses exact URL matching for close actions. This keeps bulk actions scoped to the tabs shown in the card and avoids closing unrelated pages on the same host.

Pinned tabs are skipped by every bulk-close and duplicate-cleanup action.

### Save for Later

The bookmark button saves a tab into `chrome.storage.local` before closing it. Saved items stay local and can be checked off into the archive.

### Privacy Mode

Privacy mode hides the tab dashboard and shows a minimal clock/date/search screen. It is useful before screen sharing or recording. You can customize whether the privacy screen shows:

- clock
- date
- custom text
- search box

### Themes and Language

Theme choice is stored in `localStorage` and applied before the page paints, so the selected theme does not flash back to the default on reload.

Language choice is also stored locally and applied early. The switch affects fixed UI labels only; tab titles, URLs, Chrome group names, and user-entered text are not translated or modified.

---

## Privacy

Super Tab Out is local-first.

Stored locally:

- saved-for-later tabs
- privacy mode state and settings
- view mode
- language choice
- theme choice
- favicon cache

The only routine external request is:

- `icons.duckduckgo.com` for favicons, cached locally for 7 days

No Google Fonts are used. Fonts come from system font stacks.

Privacy mode includes an optional Google search form. If you disable the search box in privacy settings, that form is not shown.

---

## Permissions

The extension currently requests:

| Permission | Why it is needed |
| --- | --- |
| `tabs` | Read, focus, close, and group open tabs |
| `activeTab` | Work with the currently active tab context |
| `storage` | Persist saved tabs, privacy settings, and view mode |
| `tabGroups` | Read and render Chrome Tab Groups |

---

## Tech Stack

| Area | Implementation |
| --- | --- |
| Extension platform | Chrome Manifest V3 |
| UI | Plain HTML, CSS, JavaScript |
| Storage | `chrome.storage.local` and `localStorage` |
| Sound | Web Audio API |
| Animations | CSS transitions and JavaScript particles |
| Build | None |

Everything runs inside the extension page. The background service worker only keeps the toolbar badge count up to date.

---

## Attribution and License

Super Tab Out is a derivative work based on **[Tab Out](https://github.com/zarazhangrui/tab-out)** by **Zara Zhang**, redistributed under the MIT License.

This project keeps the required copyright and license notices in [`LICENSE`](./LICENSE). Please do not remove those notices from substantial copies or distributions.

This fork adds security hardening, Manifest V3 updates, cross-browser new-tab handling, pinned-tab protection, Chrome Tab Groups view, bilingual UI, expanded theme support, privacy mode, search, favicon caching, and local-first saved-tab workflows.

This project is not affiliated with Google, Chrome, Microsoft Edge, Brave, DuckDuckGo, or the original Tab Out author. Product names and service names are used only to describe compatibility or attribution.

MIT. See [`LICENSE`](./LICENSE).
