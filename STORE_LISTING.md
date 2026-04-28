# Chrome Web Store Listing Draft

Use this document as copy-and-paste source material for the Chrome Web Store Developer Dashboard.

## Basic Information

**Name**

```text
Super Tab Out
```

**Short description**

```text
A local-first new tab dashboard for organizing open tabs with tab filtering, privacy mode, themes, and Chrome Tab Groups.
```

**Category**

```text
Productivity
```

**Language**

```text
English
```

The extension UI supports both English and Simplified Chinese.

## Detailed Description

```text
Super Tab Out replaces your new tab page with a local dashboard for open browser tabs.

It helps you understand what is open, find the right tab faster, clean up duplicates, and close groups of tabs without accidentally touching pinned tabs.

Highlights:
- Group tabs by domain or by Chrome's native Tab Groups
- Filter tabs instantly with the / shortcut
- Hide tab details with privacy mode before screen sharing
- Protect pinned tabs from bulk-close and duplicate-cleanup actions
- Detect duplicate pages and close extras while keeping one copy
- Save tabs for later in a local checklist
- Switch between English and Simplified Chinese
- Choose from 10 built-in visual themes
- Refresh automatically when tabs open, close, or navigate
- Store preferences and saved tabs locally

Privacy:
Super Tab Out does not require an account, does not use analytics, does not sell data, and does not upload your tab list to a server. Saved tabs and preferences stay on your device. The extension may request favicons from DuckDuckGo's icon service and cache them locally for up to 7 days.

Attribution:
Super Tab Out is distributed under the Apache License 2.0. It is a derivative work based on Tab Out by Zara Zhang, which is licensed under the MIT License. Required upstream MIT notices are preserved in this project's NOTICE file. This project is not affiliated with Google, Chrome, Microsoft Edge, Brave, DuckDuckGo, or the original Tab Out author.
```

## Single Purpose Statement

Use this in the Privacy tab if prompted.

```text
Super Tab Out replaces the new tab page with a local dashboard for organizing, filtering, saving, and closing currently open browser tabs.
```

## Permission Justifications

Use these explanations in the Privacy / Permissions sections if requested.

| Permission | Justification |
| --- | --- |
| `tabs` | Required to read open tabs, display tab titles and URLs, focus selected tabs, close tabs, and create tab groups from the dashboard. |
| `storage` | Required to store saved-for-later tabs, privacy settings, language, theme, and view preferences locally. |
| `tabGroups` | Required to read Chrome Tab Groups and render the optional grouped-tab view. |

## Privacy Practices Answers

Suggested factual answers based on the current implementation:

- The extension does not sell user data.
- The extension does not use user data for advertising.
- The extension does not transfer tab lists to a backend server.
- The extension does not collect analytics or telemetry.
- The extension stores saved tabs and preferences locally using browser storage.
- The extension uses tab titles and URLs only to render and manage the local dashboard.
- The extension requests favicons from `icons.duckduckgo.com` and caches them locally.

## Support / Homepage URLs

**Homepage URL**

```text
https://github.com/SivanCola/super-tab-out
```

**Support URL**

```text
https://github.com/SivanCola/super-tab-out/issues
```

**Privacy policy URL**

After pushing `PRIVACY.md` to GitHub, use the public file URL:

```text
https://github.com/SivanCola/super-tab-out/blob/main/PRIVACY.md
```

## Screenshot Checklist

Chrome Web Store screenshots should show the extension's actual UI. Recommended set:

1. **Main dashboard in domain view**
   - Upload: `store-assets/screenshot-1-dashboard.jpg`
   - Show several domain cards.
   - Include the tab filter control and theme/language controls.
   - Demonstrates the primary new-tab value.

2. **Chrome Tab Groups view**
   - Upload: `store-assets/screenshot-2-groups.jpg`
   - Create at least one Chrome Tab Group before taking the screenshot.
   - Show the Groups / Domains toggle.
   - Demonstrates native group support.

3. **Privacy mode**
   - Upload: `store-assets/screenshot-3-privacy.jpg`
   - Show the clock privacy screen.
   - Keep the UI free of private tab titles.
   - Demonstrates screen-sharing safety.

4. **Theme picker**
   - Upload: `store-assets/screenshot-4-themes.jpg`
   - Open the theme menu.
   - Show the 10 available palettes.
   - Demonstrates customization.

5. **Chinese UI**
   - Upload: `store-assets/screenshot-5-chinese.jpg`
   - Switch to `中`.
   - Show the same dashboard or privacy mode in Simplified Chinese.
   - Demonstrates bilingual support.

6. **Saved for later**
   - Save one or two tabs.
   - Show the right-side saved checklist.
   - Demonstrates local workflow beyond closing tabs.

## Screenshot Preparation Tips

- Use a clean browser profile with non-sensitive tabs.
- Avoid showing personal email addresses, account names, private docs, or internal work tabs.
- Use demo pages such as:
  - `https://github.com/SivanCola/super-tab-out`
  - `https://example.com`
  - `https://developer.chrome.com/docs/extensions/`
  - `https://news.ycombinator.com`
  - `https://www.wikipedia.org`
- Pin one tab to demonstrate pinned-tab protection if useful.
- Use the same theme across most screenshots for visual consistency, then use the theme picker screenshot to show variety.

## Generated Local Assets

These files are generated in this repository and can be uploaded directly:

| Store field | Local file |
| --- | --- |
| Store icon, 128x128 | `extension/icons/icon128.png` |
| Screenshot 1 | `store-assets/screenshot-1-dashboard.jpg` |
| Screenshot 2 | `store-assets/screenshot-2-groups.jpg` |
| Screenshot 3 | `store-assets/screenshot-3-privacy.jpg` |
| Screenshot 4 | `store-assets/screenshot-4-themes.jpg` |
| Screenshot 5 | `store-assets/screenshot-5-chinese.jpg` |
| Small promo tile, 440x280 | `store-assets/promo-small-440x280.jpg` |

## Release Package Checklist

Before uploading:

- `manifest.json` is at the root of the ZIP.
- The ZIP contains `app.js`, `background.js`, `index.html`, `style.css`, `theme-init.js`, and `icons/`.
- The ZIP does not contain `.git`, `.omx`, `.DS_Store`, `__MACOSX`, or personal `config.local.js`.
- The version in `manifest.json` is correct for this release.
- The extension was loaded locally and smoke-tested after packaging.
