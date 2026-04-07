# File Downloader — User Guide

A comprehensive guide to installing, using, and getting the most out of the File Downloader browser extension.

---

## Table of Contents

- [Getting Started](#getting-started)
  - [Installing on Chrome](#installing-on-chrome)
  - [Installing on Firefox](#installing-on-firefox)
  - [Pinning the Extension](#pinning-the-extension)
- [Basic Usage](#basic-usage)
  - [Scanning a Page](#scanning-a-page)
  - [Understanding the File List](#understanding-the-file-list)
  - [Selecting Files](#selecting-files)
  - [Filtering Files](#filtering-files)
  - [Downloading Files](#downloading-files)
- [Directory Scanning](#directory-scanning)
  - [What Is a Directory Listing?](#what-is-a-directory-listing)
  - [Scanning Subdirectories](#scanning-subdirectories)
  - [Using the Tree View](#using-the-tree-view)
  - [Selecting Files in Tree View](#selecting-files-in-tree-view)
  - [Rescanning Directories](#rescanning-directories)
- [File Categories and Icons](#file-categories-and-icons)
- [Tips and Best Practices](#tips-and-best-practices)
- [Troubleshooting](#troubleshooting)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

### Installing on Chrome

1. Download or clone the extension folder to your computer.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** by toggling the switch in the top-right corner.
4. Click the **Load unpacked** button.
5. In the file picker, select the `DownloaderWebExt` folder.
6. The File Downloader icon will appear in your browser toolbar.

### Installing on Firefox

1. Open Firefox and navigate to `about:debugging`.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on...**.
4. Navigate to the `DownloaderWebExt` folder and select the `manifest.json` file.
5. The extension icon will appear in your toolbar.

> **Important:** Temporary add-ons in Firefox are removed when the browser is closed. To install permanently, the extension must be signed and distributed through [addons.mozilla.org](https://addons.mozilla.org).

### Pinning the Extension

After installation, the extension icon may be hidden behind the extensions menu (puzzle piece icon in Chrome). To keep it always visible:

- **Chrome:** Click the puzzle piece icon in the toolbar, find "File Downloader", and click the pin icon next to it.
- **Firefox:** Right-click the toolbar, select **Customize Toolbar**, and drag the File Downloader icon to your preferred position.

---

## Basic Usage

### Scanning a Page

1. Navigate to any web page that contains links to downloadable files — for example, a page with PDF links, a file index, an image gallery, or a resource download page.
2. Click the **File Downloader** icon in your browser toolbar.
3. The popup opens and **automatically scans** the current page for downloadable file links.
4. A blue badge next to the title shows the total number of files found.

If no files are found, you will see the message: *"No downloadable files found."*

### Understanding the File List

Files are displayed in a grouped list organized by file type:

```
PDF (2)
  ☐ 📄 annual-report.pdf                [PDF]
  ☐ 📄 readme.pdf                       [PDF]

DOC (1)
  ☐ 📝 meeting-notes.docx               [DOCX]

XLS (1)
  ☐ 📊 budget-2024.xlsx                  [XLSX]

PNG (1)
  ☐ 🖼 banner.png                        [PNG]

ZIP (1)
  ☐ 📦 source-code.zip                   [ZIP]
```

Each file entry shows:

| Element | Description |
|---|---|
| Checkbox | Select or deselect this file for download |
| Icon | An emoji representing the file type |
| Filename | The name of the file (truncated if too long) |
| Extension badge | A small label showing the file type (e.g., PDF, PNG) |

Each file type group has a **group header** with its own checkbox that toggles all files of that type.

### Selecting Files

There are multiple ways to select files for download:

| Method | How |
|---|---|
| **Individual file** | Click the checkbox next to any file |
| **Entire type group** | Click the checkbox in the type header (e.g., "PDF", "PPT") to select or deselect all files of that type |
| **All files** | Click the **Select All** button in the toolbar |
| **Clear selection** | Click the **Deselect All** button in the toolbar |

**Partial selection indicator:** When only some files in a type group are selected, the group header checkbox shows a dash (—) indicating partial selection. Clicking it will select all remaining files in that group.

### Filtering Files

Use the search bar at the top of the popup to filter files by name:

1. Type any text in the **"Filter files..."** input field.
2. The file list updates in real time, showing only files whose names contain your search text.
3. The search is **case-insensitive** — typing "report" will match "Report.pdf", "REPORT.docx", etc.
4. Clear the search field to show all files again.

Filtering works in both the flat list view and the tree view. In tree view, entire directory branches that contain no matching files are hidden.

### Downloading Files

1. Select the files you want to download using any of the selection methods above.
2. The **Download Selected** button shows the number of selected files, e.g., `Download Selected (5)`.
3. Click the button to begin downloading.
4. Once initiated, the button briefly displays **"Done! (N downloaded)"** for 2 seconds as confirmation.
5. If any downloads fail, you will see the count of failures alongside successes.

**Where do files go?** All files are saved to your browser's default download location. You can check and change this in your browser settings:

- **Chrome:** Settings > Downloads > Location
- **Firefox:** Settings > General > Files and Applications > Downloads

To view download progress, open your browser's download manager:

- **Chrome:** Press `Ctrl+J` (Windows/Linux) or `Cmd+Shift+J` (macOS)
- **Firefox:** Press `Ctrl+J` (Windows/Linux) or `Cmd+J` (macOS)

---

## Directory Scanning

### What Is a Directory Listing?

A directory listing is a web page that shows the contents of a folder on a web server. These pages typically have titles like "Index of /files" and display a list of files and subdirectories. They are common on:

- File servers and FTP mirrors
- Apache/Nginx directory indexes
- University and research institution file repositories
- Software download mirrors

When File Downloader detects that the current page is a directory listing, it enables an additional feature: **subdirectory scanning**.

### Scanning Subdirectories

When a directory listing is detected, a blue bar appears below the toolbar:

```
┌─────────────────────────────────────────────┐
│  [Scan Subdirectories]    Scan status here   │
└─────────────────────────────────────────────┘
```

To scan all subdirectories:

1. Click the **Scan Subdirectories** button.
2. The extension begins recursively visiting each subdirectory linked from the page.
3. A real-time status message shows the current directory being scanned and the depth level, e.g., *"Scanning: docs/2024/ (depth 2)"*.
4. Scanning continues up to **5 levels deep** to prevent excessive crawling.
5. When complete, the view switches from the flat file list to an interactive **tree view**.

**What happens during scanning:**
- The extension follows links to subdirectories on the same server.
- It collects all downloadable files found in each subdirectory.
- Only same-origin links (same website) are followed for security.
- Previously visited directories are skipped to avoid loops.

### Using the Tree View

After a directory scan completes, files are displayed in a hierarchical tree structure:

```
▼ ☐ 📂 files                              [12 files]
  ▼ ☐ 📂 documents                         [5 files]
      ☐ 📄 readme.pdf                      [PDF]
      ☐ 📝 guide.docx                      [DOCX]
  ▶ ☐ 📂 images                            [4 files]
  ▼ ☐ 📂 archives                          [3 files]
      ☐ 📦 backup-jan.zip                  [ZIP]
      ☐ 📦 backup-feb.zip                  [ZIP]
      ☐ 📦 backup-mar.zip                  [ZIP]
```

**Tree view elements:**

| Element | Description |
|---|---|
| ▼ / ▶ | Toggle arrow — click to expand or collapse a directory |
| Checkbox | Select all files in this directory (and its subdirectories) |
| 📂 / 📁 | Folder icon — open (📂) when expanded, closed (📁) when collapsed |
| Directory name | The folder name |
| File count badge | Total number of downloadable files in this directory and its children |

**Expanding and collapsing:**
- Click the **toggle arrow** (▼/▶) or the **directory name** to expand or collapse a folder.
- Collapsed directories hide all their contents.
- The arrow rotates to indicate the current state.

### Selecting Files in Tree View

Selection in tree view works hierarchically:

| Action | Result |
|---|---|
| Check a **file** | Selects that single file |
| Check a **directory** | Selects all files in that directory and all its subdirectories |
| Uncheck a **directory** | Deselects all files in that directory and all its subdirectories |
| Partial selection | When some (but not all) files in a directory are selected, the directory checkbox shows a dash (—) indicating partial selection |
| **Select All** button | Selects every file across all directories |
| **Deselect All** button | Clears the entire selection |

Selection changes **propagate both ways:**
- **Downward:** Checking a parent directory checks all children.
- **Upward:** Checking/unchecking files updates ancestor directory checkboxes to reflect the correct state (checked, unchecked, or partial).

### Rescanning Directories

After a directory scan completes, the "Scan Subdirectories" button changes to **"Rescan"**. Click it to perform a fresh scan — useful if the server contents have changed or if you want to start over.

---

## File Types and Icons

The extension recognizes the following file types, each displayed as its own group:

| Type Group | Extensions | Icon |
|---|---|---|
| **PDF** | PDF | 📄 |
| **DOC** | DOC, DOCX | 📝 |
| **TXT** | TXT | 📝 |
| **XLS** | XLS, XLSX | 📊 |
| **PPT** | PPT, PPTX | 📊 |
| **PNG** | PNG | 🖼 |
| **JPG** | JPG, JPEG | 🖼 |
| **GIF** | GIF | 🖼 |
| **SVG** | SVG | 🖼 |
| **MP3** | MP3 | 🎵 |
| **MP4** | MP4 | 🎬 |
| **ZIP** | ZIP | 📦 |
| **RAR** | RAR | 📦 |

Files with unrecognized extensions are shown with the 📎 fallback icon and placed in the "Other" group. Only groups with files found on the page are displayed.

---

## Tips and Best Practices

### Getting the Best Results

- **Look for pages with direct file links.** The extension detects files linked with `<a href="...">` HTML tags. Pages that list direct download links work best.
- **Use directory listings.** File servers with "Index of" pages are ideal — the directory scan feature can recursively find all files across folders.
- **Filter before selecting.** On pages with many files, use the search bar to narrow down to what you need before selecting.

### Managing Large Downloads

- **Download in batches.** If a page has many files (50+), consider downloading them in smaller batches to avoid browser throttling.
- **Check your download folder.** Before bulk downloading, make sure your download folder has enough disk space.
- **Watch for browser prompts.** Some browsers ask for permission when multiple downloads are triggered at once. Allow the downloads when prompted.
- **Use the browser's download manager** (`Ctrl+J` / `Cmd+J`) to monitor progress, pause, or cancel individual downloads.

### Working with Directory Scans

- **Be patient with deep directory structures.** Scanning many nested subdirectories takes time as each folder must be fetched individually.
- **Watch the scan status.** The status text shows which directory is currently being scanned and at what depth level.
- **Use tree view filtering.** After a directory scan, use the search bar to find specific files within the tree structure.

---

## Troubleshooting

### No files are found on the page

**Possible causes:**
- The page does not contain any `<a>` tag links to files with supported extensions.
- Files are loaded dynamically via JavaScript after the page loads (not detectable).
- File URLs do not have a recognizable file extension (e.g., API-style URLs like `/download?id=123`).

**What to try:**
- Verify the page has direct links to files by right-clicking a file link and checking its URL.
- Look for an alternative page that provides direct download links.
- Check if the page uses frames or iframes — the extension only scans the main page.

### "Cannot access contents of this page"

The extension cannot scan certain protected pages:
- `chrome://` pages (Chrome settings, extensions page, etc.)
- `about:` pages (Firefox internal pages)
- `file://` pages (local files)
- The Chrome Web Store or Firefox Add-ons site
- Other extensions' pages

This is a browser security restriction and cannot be bypassed.

### Downloads don't start

**Possible causes:**
- Your browser is blocking multiple simultaneous downloads.
- The download permission was not granted.
- The file URL requires authentication or has expired.

**What to try:**
- Check if your browser prompted for permission to allow multiple downloads — look for a notification bar or popup.
- Try downloading fewer files at a time.
- Open one of the file URLs directly in a new tab to verify it's accessible.
- Check your browser's download settings to ensure downloads are not blocked.

> **Note:** The extension automatically sanitizes filenames by stripping common prefixes (e.g. "Download file:") and replacing characters that are invalid on Windows/macOS (such as `:`, `"`, `<`, `>`, `|`, `?`, `*`). This prevents download failures on sites like Weebly that include these characters in link titles.

### Content script injection fails

Some pages block extensions from injecting scripts due to strict Content Security Policies (CSP). This is common on:
- Banking and financial websites
- Some government websites
- Websites with strict security headers

There is no workaround for this — it's a security measure by the website.

### Scan Subdirectories button doesn't appear

The button only appears when the extension detects that the current page is a directory listing. Detection is based on:
- The page title containing "Index of"
- The page structure having `<pre>` or `<table>` elements with a high ratio of relative links

If you're on a directory listing but the button doesn't appear, the page may use a non-standard format that the heuristic doesn't recognize.

### Directory scan is slow or incomplete

- Each subdirectory requires a separate network request, so deep directory structures take time.
- Scanning stops at **5 levels deep** to prevent excessive crawling.
- Only same-origin (same website) subdirectories are followed.
- If the server rate-limits requests, some directories may be skipped.

---

## Frequently Asked Questions

**Q: Does the extension send my data anywhere?**
A: No. The extension works entirely locally in your browser. It does not send any data to external servers, does not track usage, and does not include analytics. The only network requests it makes are to the web pages and files you choose to scan and download.

**Q: Can I choose where files are downloaded to?**
A: Files are saved to your browser's default download location. You can change this in your browser settings (Chrome: Settings > Downloads; Firefox: Settings > General > Downloads). The extension does not provide its own folder picker.

**Q: Does it work with password-protected pages?**
A: Yes, as long as you are already logged in and can see the page in your browser. The extension scans the page as you see it. However, if individual file downloads require separate authentication, those downloads may fail.

**Q: Can I download files from multiple tabs at once?**
A: The extension scans the currently active tab when you open the popup. To download files from multiple pages, process one tab at a time.

**Q: Why are some files on the page not detected?**
A: The extension only detects files linked via `<a href="...">` tags with recognized file extensions. Files that are:
- Embedded directly (e.g., `<img src="...">`, `<video src="...">`)
- Loaded dynamically via JavaScript
- Behind API-style URLs without file extensions
- Inside iframes

...will not be detected.

**Q: Is there a limit to how many files I can download?**
A: There is no hard limit imposed by the extension. However, browsers may throttle or prompt for confirmation when many downloads are triggered simultaneously. For best results, download in batches of 20-30 files at a time.

**Q: Does the extension work offline?**
A: The extension itself loads offline, but scanning and downloading require an active internet connection since it needs to access web pages and download files from servers.

**Q: Which browsers are supported?**
A: The extension supports:
- **Google Chrome** (and Chromium-based browsers like Edge, Brave, Vivaldi)
- **Mozilla Firefox** version 109 or later

---

## Keyboard Shortcuts

The popup supports standard browser keyboard interactions:

| Shortcut | Action |
|---|---|
| `Tab` | Move focus between elements (search bar, buttons, checkboxes) |
| `Space` | Toggle the focused checkbox |
| `Enter` | Activate the focused button |
| `Ctrl+J` / `Cmd+J` | Open the browser's download manager (works outside the popup) |

---

*For technical documentation, architecture details, and developer information, see [README.md](README.md).*
