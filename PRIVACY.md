# Privacy Policy for Super Tab Out

Last updated: April 20, 2026

Super Tab Out is a local-first Chromium extension that replaces the new tab page with a dashboard for organizing open browser tabs.

This policy explains what data the extension uses, where it is stored, and what external requests may occur.

## Single Purpose

Super Tab Out helps users organize, filter, save, and close their currently open browser tabs from a local new-tab dashboard.

## Data the Extension Uses

Super Tab Out may read the following browser tab information to render the dashboard:

- tab title
- tab URL
- tab window ID
- tab active state
- tab pinned state
- Chrome Tab Group ID and group metadata

This information is used only to display and manage tabs inside the extension UI.

## Data Stored Locally

Super Tab Out stores the following data locally on the user's device:

- saved-for-later tab URLs and titles
- saved-for-later completion/archive state
- privacy mode state and privacy screen settings
- selected view mode
- selected language
- selected theme
- cached favicon images

Saved tabs, preferences, and settings are stored using `chrome.storage.local` and `localStorage`.

## Data Sharing

Super Tab Out does not:

- sell user data
- use user data for advertising
- transfer tab lists to a remote server
- collect analytics or telemetry
- require an account
- run a backend service

## External Requests

Super Tab Out may request favicons from:

```text
https://icons.duckduckgo.com
```

These requests are used to display small site icons next to tab entries. Favicons are cached locally for up to 7 days to reduce repeated network requests.

Privacy mode does not provide a web search box and does not change the browser search provider.

## Permissions

Super Tab Out requests the following extension permissions:

| Permission | Purpose |
| --- | --- |
| `tabs` | Read open tabs, focus tabs, close tabs, and create tab groups |
| `storage` | Store saved tabs and local preferences |
| `tabGroups` | Read Chrome Tab Groups and render grouped tab views |

The extension requests only the permissions needed for its stated tab-dashboard purpose.

## Data Retention and Deletion

Data stored by Super Tab Out remains on the user's device until the user removes it.

Users can delete stored data by:

- removing the extension from the browser
- clearing extension site data / browser storage
- dismissing saved-for-later items inside the extension UI

## Children

Super Tab Out is a general productivity tool and is not directed at children.

## Changes

If this privacy policy changes, the updated version will be published in this repository.

## Contact

For support or privacy questions, use the GitHub repository:

https://github.com/SivanCola/super-tab-out

