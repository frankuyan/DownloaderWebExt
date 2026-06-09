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
  - [Sorting Files](#sorting-files)
  - [Downloading Files](#downloading-files)
  - [Download Progress and Retry](#download-progress-and-retry)
  - [Downloading to a Subfolder](#downloading-to-a-subfolder)
  - [Copying URLs](#copying-urls)
- [Media Detection](#media-detection)
- [Directory Scanning](#directory-scanning)
  - [What Is a Directory Listing?](#what-is-a-directory-listing)
  - [Scanning Subdirectories](#scanning-subdirectories)
  - [Using the Tree View](#using-the-tree-view)
  - [Selecting Files in Tree View](#selecting-files-in-tree-view)
  - [Rescanning Directories](#rescanning-directories)
- [Dark Mode](#dark-mode)
- [Remembered Preferences](#remembered-preferences)
- [File Categories and Icons](#file-categories-and-icons)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Tips and Best Practices](#tips-and-best-practices)
- [Troubleshooting](#troubleshooting)
- [Frequently Asked Questions](#frequently-asked-questions)

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
4. Run `npm run package`, unzip `dist/file-downloader-firefox-<version>.zip`, and select that build's `manifest.json` file.
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
3. The popup opens and **automatically scans** the current page for downloadable file links and embedded media.
4. A blue badge next to the title shows the total number of files found. This count also appears on the extension icon itself.

If no files are found, you will see the message: *"No downloadable files found."*

### Understanding the File List

Files are displayed in a grouped list organized by file type:

```
PDF (2)
  ☐ 📄 annual-report.pdf                [PDF]
  ☐ 📄 readme.pdf                       [PDF]

DOC (1)
  ☐ 📝 meeting-notes.docx               [DOCX]

PNG (2)
  ☐ 🖼 banner.png              MEDIA    [PNG]
  ☐ 🖼 hero-image.png          MEDIA    [PNG]

ZIP (1)
  ☐ 📦 source-code.zip                   [ZIP]
```

Each file entry shows:

| Element | Description |
|---|---|
| Checkbox | Select or deselect this file for download |
| Icon | An emoji representing the file type |
| Filename | The name of the file (truncated if too long; hover to see full name) |
| Source tag | A "MEDIA" tag appears on files found via `<img>`, `<video>`, or `<audio>` tags rather than download links |
| Extension badge | A small label showing the file type (e.g., PDF, PNG) |

Hovering over any file shows the full source URL in a tooltip.

Each file type group has a **group header** with its own checkbox that toggles all files of that type.

### Selecting Files

There are multiple ways to select files for download:

| Method | How |
|---|---|
| **Individual file** | Click the checkbox next to any file |
| **Entire type group** | Click the checkbox in the type header (e.g., "PDF", "PPT") to select or deselect all files of that type |
| **All files** | Click the **Select All** button in the toolbar, or press `Ctrl+A` / `Cmd+A` |
| **Clear selection** | Click the **Deselect All** button in the toolbar |

**Partial selection indicator:** When only some files in a type group are selected, the group header checkbox shows a dash (—) indicating partial selection. Clicking it will select all remaining files in that group.

**Remembered preferences:** When you check or uncheck a file type group, the extension remembers your preference. The next time you open the popup on any page, your preferred categories will be automatically selected.

### Filtering Files

Use the search bar at the top of the popup to filter files by name:

1. Type any text in the **"Filter files..."** input field (or press `/` to focus it).
2. The file list updates in real time, showing only files whose names contain your search text.
3. The search is **case-insensitive** — typing "report" will match "Report.pdf", "REPORT.docx", etc.
4. Press `Escape` to clear the filter and show all files again.

Filtering works in both the flat list view and the tree view. In tree view, entire directory branches that contain no matching files are hidden.

### Sorting Files

Use the **sort dropdown** next to the search bar to change file order within each group:

| Option | Behavior |
|---|---|
| **Default** | Files appear in the order they were found on the page |
| **A → Z** | Alphabetical order by filename |
| **Z → A** | Reverse alphabetical order |

Sorting works in both flat and tree views. In tree view, files within each directory are sorted while directories remain in their original order.

### Downloading Files

1. Select the files you want to download using any of the selection methods above.
2. The **Download Selected** button shows the number of selected files, e.g., `Download Selected (5)`.
3. Click the button (or press `Ctrl+D` / `Cmd+D`) to begin downloading.
4. A **progress bar** appears showing real-time download status.
5. Downloads are processed in a queue — up to 3 files download simultaneously. This prevents browser throttling that occurs when many downloads start at once.
6. If you add more files while downloads are still running, they are appended to the current queue and start after earlier queued files.

**Where do files go?** All files are saved to your browser's default download location (or a subfolder if specified). You can check and change this in your browser settings:

- **Chrome:** Settings > Downloads > Location
- **Firefox:** Settings > General > Files and Applications > Downloads

### Download Progress and Retry

While downloads are running, a progress bar shows:

```
┌──────────────────────────────────────────────┐
│ ████████████░░░░░░░░░░░░  5/12 completed     │
│                           · 3 active · 4 queued│
└──────────────────────────────────────────────┘
```

- **Completed** — Number of successfully downloaded files
- **Active** — Files currently downloading (up to 3)
- **Queued** — Files waiting to start

If any downloads fail (due to network errors, broken URLs, etc.), a **Retry Failed** button appears:

```
Done: 10 downloaded, 2 failed        [Retry Failed (2)]
```

Click the button to re-attempt all failed downloads. You can retry as many times as needed.

### Downloading to a Subfolder

The **"Save to subfolder"** input lets you organize downloads:

1. Type a folder name in the input field (e.g., `MyProject` or `Lecture Notes`).
2. All downloaded files will be saved inside that subfolder within your default download directory.
3. Leave the field empty to download directly to the default location.

Example: If your download folder is `~/Downloads` and you type `APHG Files`, files will be saved to `~/Downloads/APHG Files/`.

### Copying URLs

The **Copy URLs** button copies all selected file URLs to your clipboard as a newline-separated list. This is useful for:

- Pasting into a download manager
- Using with command-line tools like `wget` or `curl`
- Sharing file lists with others
- Keeping a record of file sources

---

## Media Detection

In addition to scanning `<a>` download links, File Downloader detects media embedded directly on the page:

| Tag | What's Detected |
|---|---|
| `<img src="...">` | Images with supported extensions (PNG, JPG, GIF, SVG). Icons and sprites smaller than 100x100 pixels are automatically excluded. |
| `<video src="...">` | Video files (MP4) |
| `<audio src="...">` | Audio files (MP3) |
| `<source src="...">` | Media sources inside `<video>` and `<audio>` elements |

Media files appear in the file list alongside link-detected files, tagged with a small **MEDIA** label so you can distinguish their source. Files found via both a link and a media tag are only listed once (the link version takes priority).

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
3. A real-time status message shows how many directories have been explored.
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

## Dark Mode

File Downloader automatically adapts to your system's color scheme. If your operating system or browser is set to dark mode, the popup will use a dark theme with muted colors that are easy on the eyes.

No configuration is needed — the extension detects your preference via `prefers-color-scheme` and switches automatically.

---

## Remembered Preferences

The extension remembers which file type categories you select:

1. When you check a category group checkbox (e.g., "PDF"), the preference is saved.
2. When you uncheck a category, that preference is saved too.
3. The next time you open the popup on any page, your preferred categories are automatically pre-selected.

This is useful if you always want to download PDFs but never images — check PDF once, and it will be pre-selected on every page.

Preferences are stored locally in your browser and persist across sessions.

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

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+A` / `Cmd+A` | Select all files (when not typing in search/subfolder input) |
| `Ctrl+D` / `Cmd+D` | Download all selected files |
| `/` | Focus the search/filter input |
| `Escape` | Clear the search filter and unfocus |
| `Tab` | Move focus between elements |
| `Space` | Toggle the focused checkbox |
| `Enter` | Activate the focused button |
| `Ctrl+J` / `Cmd+J` | Open the browser's download manager (works outside the popup) |

---

## Tips and Best Practices

### Getting the Best Results

- **Look for pages with direct file links.** The extension detects files linked with `<a href="...">` HTML tags. Pages that list direct download links work best.
- **Image galleries work too.** The extension now detects `<img>` tags, so image galleries and photo pages will show downloadable images.
- **Use directory listings.** File servers with "Index of" pages are ideal — the directory scan feature can recursively find all files across folders.
- **Filter before selecting.** On pages with many files, use the search bar to narrow down to what you need before selecting.

### Managing Large Downloads

- **The queue handles it.** Unlike before, you don't need to download in batches. The built-in queue processes up to 3 files at a time, preventing browser throttling.
- **Use subfolders.** When downloading many files, use the subfolder option to keep them organized.
- **Check your download folder.** Before bulk downloading, make sure your download folder has enough disk space.
- **Watch for browser prompts.** Some browsers ask for permission when multiple downloads are triggered at once. Allow the downloads when prompted.
- **Use the browser's download manager** (`Ctrl+J` / `Cmd+J`) to monitor progress, pause, or cancel individual downloads.
- **Use Copy URLs for external tools.** For very large batches, copy URLs and use a download manager like `wget` or `aria2` for better control.

### Working with Directory Scans

- **Be patient with deep directory structures.** Scanning many nested subdirectories takes time as each folder must be fetched individually.
- **Watch the scan status.** The status text shows how many directories have been explored.
- **Use tree view filtering.** After a directory scan, use the search bar to find specific files within the tree structure.

---

## Troubleshooting

### No files are found on the page

**Possible causes:**
- The page does not contain any `<a>` tag links or media elements with supported extensions.
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

### Too many images detected

If a page has many embedded images you don't want:
- Use the search filter to narrow down to specific file names.
- Uncheck the image type groups (PNG, JPG, etc.) — the extension will remember this preference.
- Images smaller than 100x100 pixels are already filtered out automatically.

---

## Frequently Asked Questions

**Q: Does the extension send my data anywhere?**
A: No. The extension works entirely locally in your browser. It does not send any data to external servers, does not track usage, and does not include analytics. The only network requests it makes are to the web pages and files you choose to scan and download.

**Q: Can I choose where files are downloaded to?**
A: Files are saved to your browser's default download location. You can use the "Save to subfolder" option to create a named subfolder. To change the default location, update your browser settings (Chrome: Settings > Downloads; Firefox: Settings > General > Downloads).

**Q: Does it work with password-protected pages?**
A: Yes, as long as you are already logged in and can see the page in your browser. The extension scans the page as you see it. However, if individual file downloads require separate authentication, those downloads may fail.

**Q: Can I download files from multiple tabs at once?**
A: The extension scans the currently active tab when you open the popup. To download files from multiple pages, process one tab at a time.

**Q: Why are some files on the page not detected?**
A: The extension detects files linked via `<a href="...">` tags and embedded via `<img>`, `<video>`, `<audio>` tags with recognized file extensions. Files that are:
- Loaded dynamically via JavaScript
- Behind API-style URLs without file extensions
- Inside iframes
- Referenced only in CSS

...will not be detected.

**Q: Is there a limit to how many files I can download?**
A: There is no hard limit. The download queue processes up to 3 files at a time, so even large batches (100+ files) are handled smoothly without overwhelming the browser.

**Q: What happens if I close the popup during a download?**
A: Downloads continue in the background. The browser's download manager (`Ctrl+J` / `Cmd+J`) shows all active downloads. However, the popup's progress bar will not resume if you reopen it — check the download manager instead.

**Q: How do I reset my remembered type preferences?**
A: Uncheck all group checkboxes that are auto-selected, and the preferences will be cleared. Alternatively, you can clear the extension's storage via the browser's developer tools.

**Q: Does the extension work offline?**
A: The extension itself loads offline, but scanning and downloading require an active internet connection since it needs to access web pages and download files from servers.

**Q: Which browsers are supported?**
A: The extension supports:
- **Google Chrome** (and Chromium-based browsers like Edge, Brave, Vivaldi)
- **Mozilla Firefox** version 109 or later

---

*For technical documentation, architecture details, and developer information, see [README.md](README.md).*
