# File Downloader — Browser Extension

A cross-browser (Chrome MV3 + Firefox) extension that scans the current page for downloadable file links and media, displays them in a popup with checkboxes, and supports bulk downloading with a queued download manager.

---

## Table of Contents

- [Features](#features)
- [Supported File Types](#supported-file-types)
- [Installation](#installation)
  - [Chrome](#chrome)
  - [Firefox](#firefox)
- [Usage](#usage)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [Data Flow](#data-flow)
  - [Component Details](#component-details)
- [Permissions](#permissions)
- [Cross-Browser Compatibility](#cross-browser-compatibility)
- [Development](#development)
  - [Modifying Supported File Types](#modifying-supported-file-types)
  - [Customizing the UI](#customizing-the-ui)
  - [Debugging](#debugging)
- [Limitations](#limitations)
- [License](#license)

---

## Features

- **Page scanning** — Automatically finds downloadable file links (`<a>` tags) and embedded media (`<img>`, `<video>`, `<audio>` tags) on the current page.
- **Grouped display** — Files are organized by file type (PDF, DOC, PPT, PNG, etc.) with per-type selection.
- **Media detection** — Images, videos, and audio files embedded on the page are detected and tagged as "media" sources. Small icons/sprites (< 100px) are automatically filtered out.
- **Bulk selection** — Select All / Deselect All buttons, plus per-group toggle checkboxes.
- **Search/filter** — Real-time filtering of files by filename.
- **Sort** — Sort files by name (A-Z or Z-A) within each group via dropdown.
- **Queued downloads** — Downloads are processed in a queue with up to 3 concurrent downloads, preventing browser throttling.
- **Download progress** — Real-time progress bar showing completed, active, and queued download counts.
- **Retry failed** — Failed downloads can be retried with a single click.
- **Subfolder support** — Optionally download files into a named subfolder within the default download directory.
- **Copy URLs** — Copy selected file URLs to clipboard for use with external tools (wget, curl, etc.).
- **Duplicate filename detection** — Files with identical display names are automatically numbered (e.g., `report (2).pdf`).
- **Remember preferences** — Remembers which file type categories you typically select, auto-checking them on the next page.
- **Extension badge** — Shows file count on the toolbar icon so you can see at a glance if a page has files.
- **Dark mode** — Automatically adapts to your system's dark/light color scheme.
- **Keyboard shortcuts** — `Ctrl+A` select all, `Ctrl+D` download, `/` focus search, `Escape` clear filter.
- **Filename sanitization** — Strips common prefixes (e.g., Weebly's "Download file:") and replaces characters invalid on Windows/macOS.
- **File count badge** — Shows how many downloadable files were found.
- **Directory scanning** — Recursively scans subdirectories on file server index pages with an interactive tree view.
- **Cross-browser** — Works in both Chrome (MV3) and Firefox (109+).

---

## Supported File Types

| Category    | Extensions           |
|-------------|----------------------|
| PDF         | PDF                  |
| DOC         | DOC, DOCX            |
| XLS         | XLS, XLSX            |
| PPT         | PPT, PPTX            |
| TXT         | TXT                  |
| PNG         | PNG                  |
| JPG         | JPG, JPEG            |
| GIF         | GIF                  |
| SVG         | SVG                  |
| MP3         | MP3                  |
| MP4         | MP4                  |
| ZIP         | ZIP                  |
| RAR         | RAR                  |

---

## Installation

### Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `DownloaderWebExt` folder.
5. The extension icon appears in the toolbar. Pin it for easy access.

### Firefox

1. Open `about:debugging` in Firefox.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on**.
4. Run `npm run package`, unzip `dist/file-downloader-firefox-<version>.zip`, and select that build's `manifest.json`.
5. The extension icon appears in the toolbar.

> **Note:** Temporary add-ons in Firefox are removed when the browser closes. For permanent installation, the extension must be signed and distributed through [addons.mozilla.org](https://addons.mozilla.org).

---

## Usage

1. Navigate to any web page that contains links to downloadable files (e.g., a page with PDF links, an image gallery, a file index).
2. Click the **File Downloader** icon in the browser toolbar. The badge on the icon shows the file count.
3. The popup opens and automatically scans the page. Found files appear grouped by category.
4. **Filter** — Type in the search bar to narrow down files by name.
5. **Sort** — Use the dropdown next to search to sort files alphabetically.
6. **Select files** — Check individual files, use group header checkboxes to toggle entire categories, or use the **Select All** / **Deselect All** buttons.
7. **Subfolder** — Optionally type a subfolder name to organize downloads.
8. Click **Download Selected** to start downloading. A progress bar shows real-time status.
9. If any downloads fail, click **Retry Failed** to re-download them.
10. Use **Copy URLs** to copy selected file URLs to clipboard.

---

## Architecture

### Project Structure

```
DownloaderWebExt/
├── manifest.json          # Chrome MV3 manifest
├── manifest.firefox.json  # Firefox MV3 manifest used during packaging
├── content.js             # Content script — scans page for file links and media
├── background.js          # Background script — queued download manager
├── popup/
│   ├── popup.html         # Popup UI structure
│   ├── popup.css          # Popup styling (light + dark mode)
│   └── popup.js           # Popup logic (scan, rendering, selection, download, preferences)
├── icons/
│   ├── icon-16.png        # Toolbar icon (16x16)
│   ├── icon-48.png        # Extension management icon (48x48)
│   └── icon-128.png       # Chrome Web Store / large icon (128x128)
├── scripts/
│   ├── package.sh         # Builds Chrome and Firefox submission zips
│   ├── validate.sh        # Runs manifest, syntax, and smoke-test checks
│   ├── validate.js        # Manifest and required-file validation
│   └── smoke-tests.js     # Dependency-free runtime smoke tests
└── README.md              # This file
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER CLICKS EXTENSION ICON                   │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  popup.js                                                           │
│  1. Queries active tab                                              │
│  2. Injects content.js via chrome.scripting.executeScript()         │
│  3. Sends { action: "scanPage" } message to content script          │
│  4. Loads type preferences from storage                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  content.js (runs in the web page context)                          │
│  1. Queries all <a href="..."> elements                             │
│  2. Scans <img>, <video>, <audio>, <source> tags for media          │
│  3. Filters by supported file extensions                            │
│  4. Deduplicates by URL, then deduplicates filenames                │
│  5. Returns array of { url, filename, type, source }                │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  popup.js                                                           │
│  1. Receives file list                                              │
│  2. Sets badge count on extension icon                              │
│  3. Groups files by type with remembered preferences                │
│  4. Renders grouped file list with checkboxes and source tags       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼  (user selects files and clicks Download)
┌─────────────────────────────────────────────────────────────────────┐
│  popup.js                                                           │
│  Opens port ("downloads") to background, sends files + subfolder    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  background.js (download queue manager)                             │
│  1. Queues files, processes up to 3 concurrent downloads            │
│  2. Sends real-time progress updates via port                       │
│  3. Tracks completed/failed downloads                               │
│  4. Supports retry of failed downloads                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### `manifest.json`

Defines the Chrome MV3 extension:

- **`action`** — Configures the toolbar popup (`popup/popup.html`) and icons.
- **`background.service_worker`** — Registers `background.js` as the Chrome MV3 service worker.
- **`permissions`** — Declares `activeTab`, `downloads`, `scripting`, and `storage` (see [Permissions](#permissions)).

`manifest.firefox.json` uses Firefox's `background.scripts` form and carries the Gecko add-on ID. `scripts/package.sh` copies it into the Firefox build as `manifest.json`.

#### `content.js`

Injected into the active tab on demand (not declared in `content_scripts` in the manifest). This is the MV3-preferred approach using `chrome.scripting.executeScript()`.

**Key functions:**

| Function | Purpose |
|---|---|
| `getFileExtension(url)` | Extracts the file extension from a URL's pathname. Uses `URL` constructor for reliable parsing. Returns lowercase extension or `null`. |
| `getFilename(url)` | Extracts the filename from the last path segment. Decodes URI components for display. |
| `sanitizeFilename(name)` | Strips common download prefixes (e.g. Weebly's "Download file: ") and replaces characters invalid in filenames on Windows/macOS/Linux (`<>:"/\|?*`) with underscores. |
| `getDisplayName(link, ext)` | Extracts a human-readable filename from link attributes (download, title, text content, aria-label) with URL filename as fallback. All names are passed through `sanitizeFilename()`. |
| `deduplicateFilenames(files)` | Detects files with identical display names and appends a number suffix (e.g., `report (2).pdf`) to prevent overwrites. |
| `scanPage()` | Main scanner. Queries all `<a[href]>` elements plus `<img>`, `<video>`, `<audio>`, and `<source>` tags. Filters by supported extensions, deduplicates by URL and filename, tags each file with its source ("link" or "media"). Small images (< 100px) are skipped. |

**Message handling:**

Listens for `{ action: "scanPage" }` messages and responds with scan results using `sendResponse`, which works across Chrome and Firefox.

#### `background.js`

Runs as a background script (Firefox) or service worker (Chrome). Manages a **download queue** with a concurrency limit of 3.

**Download queue:**

- Files are added to a queue and processed up to `MAX_CONCURRENT` (3) at a time.
- Uses `downloads.onChanged` to track when each download completes or fails.
- Sends real-time progress updates (`progress` messages) and a final `done` message via a port connection.
- Supports `retry` action to re-queue all failed downloads.
- Filenames are sanitized (invalid characters replaced) before calling `downloads.download()`.
- Optional subfolder prefix is prepended to filenames.

**Port communication:**

Listens for port connections named `"downloads"`. Handles three actions:
- `download` — Start a new batch of downloads
- `retry` — Re-queue failed downloads from the current batch
- `status` — Report current queue status

#### `popup/popup.js`

The main UI controller. Manages:

| Concern | Details |
|---|---|
| **Tab scanning** | Uses `chrome.tabs.query()` to get the active tab, then `chrome.scripting.executeScript()` to inject the content script, then `chrome.tabs.sendMessage()` to trigger scanning. |
| **Rendering** | Groups files by file type using the `CATEGORIES` mapping. Media-sourced files get a "media" tag. Renders section headers with group-level checkboxes. |
| **Sorting** | Sort dropdown triggers re-render with files sorted alphabetically (A-Z or Z-A) within each group. Works in both flat and tree views. |
| **Filtering** | The search input triggers `render(filter)` on every keystroke, showing only matching files (case-insensitive). |
| **Selection** | Tracks selection via DOM checkbox state. Group checkboxes use `indeterminate` for partial selection. Select All / Deselect All operate on all visible checkboxes. |
| **Type preferences** | Uses `storage.local` to remember which categories the user checks. Preferences are loaded on popup open and applied during rendering. |
| **Downloading** | Opens a port to the background script, sends files with optional subfolder. Receives progress updates and displays a progress bar with status text. |
| **Retry** | When downloads fail, a "Retry Failed" button appears. Clicking it sends a `retry` message to the background to re-queue failed files. |
| **Copy URLs** | Copies selected file URLs as newline-separated text to the clipboard. |
| **Badge** | Sets the file count on the extension toolbar icon using `action.setBadgeText()`. |
| **Keyboard shortcuts** | `Ctrl+A` select all, `Ctrl+D` download, `/` focus search, `Escape` clear filter. |

#### `popup/popup.css`

Styles the popup at a fixed width of 400px with a max height of 520px (scrollable). Uses CSS custom properties for theming:

- **Light/dark mode** — Automatically switches via `prefers-color-scheme` media query with full variable-based theming.
- **Badge** — Accent-colored pill showing file count.
- **Search row** — Flex row with search input and sort dropdown.
- **Progress bar** — Animated fill bar with status text and retry button.
- **Source tag** — Small "MEDIA" label on files detected from embedded tags.
- **File items** — Flex row with checkbox, emoji icon, truncated filename, optional source tag, and extension badge.

---

## Permissions

| Permission   | Why It's Needed |
|---|---|
| `activeTab`  | Allows the extension to access the content of the currently active tab when the user clicks the extension icon. Scoped to user-initiated action only. |
| `downloads`  | Required to use the `chrome.downloads.download()` API to programmatically start file downloads and track their progress. |
| `scripting`  | Required for the MV3 `chrome.scripting.executeScript()` API, used to inject the content script into the active tab on demand. |
| `storage`    | Required to save and load user preferences (remembered file type selections) across sessions using `chrome.storage.local`. |

> These are minimal permissions. The extension does **not** request `<all_urls>`, `tabs`, or any host permissions — it only accesses the current tab when the user explicitly clicks the icon.

---

## Cross-Browser Compatibility

The extension uses a namespace polyfill pattern at the top of each script:

```js
const api = typeof browser !== "undefined" ? browser : chrome;
```

- **Chrome** — Uses the `chrome.*` namespace natively.
- **Firefox** — Provides the `browser.*` namespace with Promise-based APIs. The fallback ensures compatibility in either environment.
- **Manifest** — Chrome and Firefox use different background declarations, so the repo keeps `manifest.json` for Chrome and `manifest.firefox.json` for Firefox packaging.

---

## Development

### Validation and Tests

Run validation before packaging:

```
npm run validate
```

This checks both manifests, runs JavaScript syntax checks, and executes dependency-free smoke tests for queue concurrency and filename/path helpers. The smoke tests can also be run directly:

```
npm test
```

### Building for Submission

A shell script in `scripts/` produces separate packages for the Chrome Web Store and Firefox AMO:

```
npm run package
# or
bash scripts/package.sh
```

The outputs are written to `dist/file-downloader-chrome-<version>.zip` and `dist/file-downloader-firefox-<version>.zip`. Each package includes `manifest.json`, `background.js`, `content.js`, `popup/`, `icons/`, and `LICENSE`; dev files (`dist/`, `scripts/`, `USERGUIDE.md`, `CHANGELOG.md`, dotfiles) are excluded.

To cut a release:

1. Update `version` in `manifest.json`, `manifest.firefox.json`, and `package.json` (keep them in sync).
2. Add an entry to `CHANGELOG.md`.
3. Run `npm run validate`.
4. Run `npm run package`.
5. Upload the matching zip to the [Chrome Web Store Dashboard](https://chrome.google.com/webstore/devconsole) or [Firefox AMO](https://addons.mozilla.org/developers/).

### Modifying Supported File Types

File extensions are defined in two places:

1. **`content.js`** — The `SUPPORTED_EXTENSIONS` array at the top of the file. Add or remove extensions here to change what the page scanner detects.

2. **`popup/popup.js`** — The `CATEGORIES` object maps category names to arrays of extensions. Add new extensions to the appropriate category, or create a new category. Also update `TYPE_ICONS` to assign an emoji icon for any new extension.

**Example — adding `.csv` support:**

```js
// content.js
const SUPPORTED_EXTENSIONS = [
  // ... existing extensions ...
  "csv"
];

// popup/popup.js
const CATEGORIES = {
  // ... existing type groups ...
  CSV: ["csv"],
};

const TYPE_ICONS = {
  // ... existing icons ...
  csv: "📊"
};
```

### Customizing the UI

- **Popup dimensions** — Edit `body` width/max-height in `popup/popup.css`.
- **Colors** — The theme uses CSS custom properties defined in `:root`. Edit these to change the color scheme for both light and dark modes.
- **Dark mode** — The `@media (prefers-color-scheme: dark)` block overrides the CSS variables. Edit these to customize the dark theme.
- **Download concurrency** — Change `MAX_CONCURRENT` in `background.js` (default: 3).
- **Icons** — Replace the PNG files in `icons/` with your own. Sizes must be 16x16, 48x48, and 128x128 pixels.

### Debugging

#### Chrome

1. Open `chrome://extensions`.
2. Find the extension and click **Inspect views: service worker** to open DevTools for `background.js`.
3. Right-click the extension popup and choose **Inspect** to debug `popup.js` and `popup.html`.
4. For `content.js`, open DevTools on the target page (F12) and check the Console — content scripts log to the page's console.

#### Firefox

1. Open `about:debugging` → **This Firefox**.
2. Click **Inspect** next to the extension to open DevTools for the background script.
3. For the popup, right-click the extension icon and select **Inspect Extension** (or use Browser Toolbox).
4. Content script logs appear in the target page's console.

#### Common Issues

| Issue | Cause | Fix |
|---|---|---|
| Popup shows "No downloadable files found" | Page has no `<a>` tags or media elements with matching file extensions | Verify the page actually has direct file links or embedded media. Dynamically loaded content may not be detected. |
| "Cannot access contents of this page" | Extension lacks permission for the page (e.g., `chrome://` pages, browser internal pages) | `activeTab` only works on regular web pages. Browser-internal pages are restricted. |
| Downloads don't start | Browser blocking downloads, missing `downloads` permission, or invalid characters in filename | Filenames are automatically sanitized (colons, quotes, etc. replaced). Check the browser console for errors. |
| Content script injection fails | Page uses strict CSP or is a protected page | Some pages (browser settings, extension pages, web store) block content script injection entirely. |
| Too many small images detected | Page has many tiny UI images | Images smaller than 100x100px are automatically filtered out. If you still see unwanted images, use the search filter. |

---

## Limitations

- **Link and media detection only** — The scanner detects `<a href>` links and `<img>`, `<video>`, `<audio>`, `<source>` tags. It does not detect files loaded via JavaScript, referenced in CSS backgrounds, or embedded in iframes.
- **Extension-based detection** — Files are identified by URL path extension only. URLs without extensions (e.g., download APIs like `/download?id=123`) are not detected.
- **No individual download progress** — The progress bar shows batch progress (how many files completed), not per-file byte progress.
- **Protected pages** — Cannot scan `chrome://`, `about:`, `file://`, or extension pages due to browser security restrictions.
- **Rate limiting** — Although the download queue limits concurrency to 3, some servers may still rate-limit requests.
- **Preferences are per-browser** — Type preferences are stored in `storage.local` and do not sync across browsers or devices.

---

## License

MIT — see [LICENSE](LICENSE).
