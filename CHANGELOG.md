# Changelog

English · [简体中文](./CHANGELOG.zh-CN.md)

All notable changes to Super Tab Out are tracked here.

## Unreleased

## 1.0.2 - 2026-04-30

### Added

- Added schema-aware storage, tabs, search, actions, and metrics services as the first architecture split for the v1.1 foundation.
- Added storage migration for `chrome.storage.local`, quota/error toast handling, and lightweight Node unit tests.
- Added an extension validator for manifest checks, script syntax, service loading order, and store ZIP hygiene.
- Added unified search indexing for open tabs, Chrome group titles, saved-for-later items, and saved sessions.
- Added fuzzy search, match highlighting, and `domain:` / `group:` / `url:` / `saved:` filter syntax.
- Added manifest commands, `sto` omnibox actions, and the optional Side Panel command center.
- Added Side Panel search, jump, save-for-later, close, duplicate cleanup, recent-closed restore, and session save flows.
- Added Chrome Tab Groups actions for creating native groups from domain cards, renaming, recoloring, collapsing/expanding, ungrouping, saving sessions, and restoring saved sessions back into Chrome tab groups from the dashboard.
- Added Tab Health, weekly stats, top domains, achievements, and Side Panel tools for JSON, QR-style encoding, and timestamps.
- Added a FeHelper-inspired local tools registry, compact Command Center tool directory, three-column Tools workbench, tool favorites/recent history, current-tab shortcuts, structured previews, real local QR SVGs, and session export.
- Added icon-button `aria-label`s, keyboard activation for tab chips, visible focus states, `prefers-reduced-motion` support, and an external favicon privacy toggle.

### Changed

- Routed saved-for-later, view mode, privacy settings, tab closing, duplicate cleanup, and open-tab search through shared services.
- Extended the new-tab search pill so it filters both tab cards and saved-for-later/archive entries.
- Updated permissions and privacy documentation for `sidePanel` and `sessions`.
- Updated privacy documentation for the external favicon toggle.
- Updated README screenshot galleries and store screenshots for the current Command Center and Tools UI.
- Bumped the extension, package metadata, validator package targets, and generated Chrome/Edge store packages to `1.0.2`.

## 1.0.1 - 2026-04-22

### Changed

- Bumped the extension manifest version to `1.0.1` for the next store upload.
- Renamed generated Chrome and Edge store packages to `super-tab-out-chrome-1.0.1.zip` and `super-tab-out-edge-1.0.1.zip`.
- Updated English and Simplified Chinese documentation to point to the new package filenames.
- Fixed the theme picker layer so the full palette opens above the tab dashboard.

## 1.0.0 - 2026-04-21

### Added

- Added a Huashu-inspired visual refresh for the new-tab dashboard, with a quieter command-desk layout, tighter information hierarchy, and more polished card surfaces.
- Added text-first page header branding that keeps the product name, greeting, and date visible without showing an extra decorative app icon inside the page.
- Added clearer top-right controls for privacy mode, language switching, and theme selection.
- Added store-ready Chrome and Edge packages in `dist/`.

### Changed

- Refined tab cards, section headers, filter controls, badges, action buttons, and responsive mobile layout.
- Kept the browser extension icon available through the browser UI and package manifest, while removing the in-page header icon.
- Kept the privacy screen free of web search UI to avoid changing the user's search experience.

### Verified

- Validated `manifest.json` as JSON.
- Checked `app.js`, `background.js`, and `theme-init.js` syntax with Node.
- Ran `git diff --check`.
- Loaded the unpacked extension in Chrome for Testing and verified the new page header, viewport fit, and absence of the removed icon.
- Checked generated zip contents to exclude local debug folders and macOS metadata.
