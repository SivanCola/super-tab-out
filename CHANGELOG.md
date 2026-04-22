# Changelog

English · [简体中文](./CHANGELOG.zh-CN.md)

All notable changes to Super Tab Out are tracked here.

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
