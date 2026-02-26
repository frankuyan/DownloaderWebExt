# File Downloader — Browser Extension

A cross-browser (Chrome MV3 + Firefox) extension that scans the current page for downloadable file links, displays them in a popup with checkboxes, and supports bulk downloading.

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

- **Page scanning** — Automatically finds all downloadable file links on the current page.
- **Grouped display** — Files are organized by file type (PDF, DOC, PPT, PNG, etc.) with per-type selection.
- **Bulk selection** — Select All / Deselect All buttons, plus per-group toggle checkboxes.
- **Search/filter** — Real-time filtering of files by filename.
- **Bulk download** — Download all selected files with one click; the browser's native download manager handles progress.
- **File count badge** — Shows how many downloadable files were found.
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
4. Navigate to the `DownloaderWebExt` folder and select `manifest.json`.
5. The extension icon appears in the toolbar.

> **Note:** Temporary add-ons in Firefox are removed when the browser closes. For permanent installation, the extension must be signed and distributed through [addons.mozilla.org](https://addons.mozilla.org).

---

## Usage

1. Navigate to any web page that contains links to downloadable files (e.g., a page with PDF links, an image gallery, a file index).
2. Click the **File Downloader** icon in the browser toolbar.
3. The popup opens and automatically scans the page. Found files appear grouped by category.
4. **Filter** — Type in the search bar to narrow down files by name.
5. **Select files** — Check individual files, use group header checkboxes to toggle entire categories, or use the **Select All** / **Deselect All** buttons.
6. Click **Download Selected** to start downloading. The button shows a count of selected files.
7. Download progress and management is handled by the browser's built-in download manager (Ctrl+J / Cmd+J).

---

## Architecture

### Project Structure

```
DownloaderWebExt/
├── manifest.json          # Extension manifest (MV3, cross-browser)
├── content.js             # Content script — scans page for file links
├── background.js          # Service worker — handles download API calls
├── popup/
│   ├── popup.html         # Popup UI structure
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup logic (scan trigger, rendering, selection, download)
├── icons/
│   ├── icon-16.png        # Toolbar icon (16×16)
│   ├── icon-48.png        # Extension management icon (48×48)
│   └── icon-128.png       # Chrome Web Store / large icon (128×128)
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
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  content.js (runs in the web page context)                          │
│  1. Queries all <a href="..."> elements                             │
│  2. Filters by supported file extensions                            │
│  3. Deduplicates by URL                                             │
│  4. Returns array of { url, filename, type }                        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  popup.js                                                           │
│  1. Receives file list                                              │
│  2. Groups files by type (PDF, DOC, PPT, PNG, etc.)                 │
│  3. Renders grouped file list with checkboxes                       │
│  4. Updates badge count                                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼  (user selects files and clicks Download)
┌─────────────────────────────────────────────────────────────────────┐
│  popup.js                                                           │
│  Sends { action: "download", files: [...] } to background script    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  background.js (background script)                                  │
│  1. Receives file list (url + filename pairs)                       │
│  2. Calls browser.downloads.download() for each file                │
│  3. Reports back { completed, failed } counts                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### `manifest.json`

Defines the extension using Manifest V3 format:

- **`action`** — Configures the toolbar popup (`popup/popup.html`) and icons.
- **`background.scripts`** — Registers `background.js` as the background script (Firefox). For Chrome compatibility, use `service_worker` instead or include both.
- **`permissions`** — Declares `activeTab`, `downloads`, and `scripting` (see [Permissions](#permissions)).
- **`browser_specific_settings.gecko`** — Provides a fixed extension ID and minimum Firefox version for Firefox compatibility.

#### `content.js`

Injected into the active tab on demand (not declared in `content_scripts` in the manifest). This is the MV3-preferred approach using `chrome.scripting.executeScript()`.

**Key functions:**

| Function | Purpose |
|---|---|
| `getFileExtension(url)` | Extracts the file extension from a URL's pathname. Uses `URL` constructor for reliable parsing. Returns lowercase extension or `null`. |
| `getFilename(url)` | Extracts the filename from the last path segment. Decodes URI components for display. |
| `getDisplayName(link, ext)` | Extracts a human-readable filename from link attributes (download, title, text content, aria-label) with URL filename as fallback. Appends extension if missing. |
| `scanPage()` | Main scanner. Queries all `<a[href]>` elements, filters by supported extensions, deduplicates by full URL, and returns an array of file objects with display names. |

**Message handling:**

Listens for `{ action: "scanPage" }` messages and returns a Promise with the scan results (Firefox-compatible).

#### `background.js`

Runs as a background script (Firefox) or service worker (Chrome).

**Message handling:**

Listens for `{ action: "download", files: [...] }` messages. Each file object contains `url` and `filename`. Calls `browser.downloads.download()` for each file with the display filename. Returns a Promise that resolves with `{ completed, failed }` counts when all downloads complete.

#### `popup/popup.js`

The main UI controller. Manages:

| Concern | Details |
|---|---|
| **Tab scanning** | Uses `chrome.tabs.query()` to get the active tab, then `chrome.scripting.executeScript()` to inject the content script, then `chrome.tabs.sendMessage()` to trigger scanning. |
| **Rendering** | Groups files by file type (PDF, DOC, PPT, etc.) using the `CATEGORIES` mapping. Renders section headers with group-level checkboxes and individual file items with per-file checkboxes. |
| **Filtering** | The search input triggers `renderFiles(filter)` on every keystroke, re-rendering only files whose filenames match the filter string (case-insensitive). |
| **Selection** | Tracks selection state via DOM checkbox state. Group checkboxes use the `indeterminate` property for partial selection. Select All / Deselect All operate on all visible checkboxes. |
| **Downloading** | Collects selected files (URL + display filename) and sends them to the background script. Files are saved with their display names. Shows a "Done!" confirmation for 2 seconds after completion. |

#### `popup/popup.css`

Styles the popup at a fixed width of 380px with a max height of 500px (scrollable). Uses system font stack for native look. Key visual elements:

- **Badge** — Blue pill showing file count.
- **Search input** — Full-width with focus ring.
- **Group headers** — Uppercase labels with checkboxes and bottom border.
- **File items** — Flex row with checkbox, emoji icon, truncated filename, and extension badge.

---

## Permissions

| Permission   | Why It's Needed |
|---|---|
| `activeTab`  | Allows the extension to access the content of the currently active tab when the user clicks the extension icon. Scoped to user-initiated action only — does not grant background access to all tabs. |
| `downloads`  | Required to use the `chrome.downloads.download()` API to programmatically start file downloads. |
| `scripting`  | Required for the MV3 `chrome.scripting.executeScript()` API, used to inject the content script into the active tab on demand. |

> These are minimal permissions. The extension does **not** request `<all_urls>`, `tabs`, or any host permissions — it only accesses the current tab when the user explicitly clicks the icon.

---

## Cross-Browser Compatibility

The extension uses a namespace polyfill pattern at the top of each script:

```js
const api = typeof browser !== "undefined" ? browser : chrome;
```

- **Chrome** — Uses the `chrome.*` namespace natively.
- **Firefox** — Provides the `browser.*` namespace with Promise-based APIs. The fallback ensures compatibility in either environment.
- **Manifest** — The `browser_specific_settings.gecko` block in `manifest.json` provides Firefox with a fixed add-on ID and minimum version requirement (109+, when MV3 support was added).

---

## Development

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
- **Colors** — The primary color is `#2563eb` (blue-600). Search for this value in `popup.css` to change the accent color.
- **Icons** — Replace the PNG files in `icons/` with your own. Sizes must be 16×16, 48×48, and 128×128 pixels.

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
| Popup shows "No downloadable files found" | Page has no `<a>` tags with matching file extensions in `href` | Verify the page actually has direct file links. Dynamically loaded links or links behind JavaScript may not be detected. |
| "Cannot access contents of this page" | Extension lacks permission for the page (e.g., `chrome://` pages, browser internal pages) | `activeTab` only works on regular web pages. Browser-internal pages are restricted. |
| Downloads don't start | Browser blocking downloads or missing `downloads` permission | Check the browser's download settings. Some browsers block multiple simultaneous downloads — you may see a permission prompt. |
| Content script injection fails | Page uses strict CSP or is a protected page | Some pages (browser settings, extension pages, web store) block content script injection entirely. |

---

## Limitations

- **Only detects `<a>` tags** — The scanner looks for `<a href="...">` elements with file extensions in the URL path. It does not detect files loaded via JavaScript, embedded in iframes, or referenced in `<video>`/`<audio>`/`<img>` `src` attributes.
- **Extension-based detection** — Files are identified by URL path extension only. URLs without extensions (e.g., download APIs like `/download?id=123`) are not detected.
- **No download progress in popup** — Download progress is handled entirely by the browser's native download manager. The popup only shows initiation status.
- **No subdirectory organization** — All downloads go to the browser's default download location. There is no option to choose a download folder or create subdirectories.
- **Protected pages** — Cannot scan `chrome://`, `about:`, `file://`, or extension pages due to browser security restrictions.
- **Rate limiting** — Downloading many files simultaneously may trigger browser-level download throttling or prompts.

---

## License

MIT
