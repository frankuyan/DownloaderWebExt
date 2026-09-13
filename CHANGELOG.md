# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Download queue now reserves slots while new downloads are starting, so the
  configured concurrency limit is enforced.
- Tree-view downloads preserve relative directory paths while sanitizing path
  segments before calling the downloads API.
- Content-script scan responses now use `sendResponse` for cross-browser
  runtime messaging compatibility.
- Directory scanning now normalizes directory prefixes and fragments before
  crawling, avoiding sibling-path matches.
- Directory scanning now treats extensionless listing URLs without a trailing
  slash as directories before resolving child links.
- Popup badge state is cleared when a scan finds no files.
- Download requests received while a batch is active are appended to the
  current queue instead of resetting batch accounting.
- Filtering or sorting the list no longer drops selections. Selected files are
  tracked independently of the rendered DOM, so files hidden by the search box
  are still downloaded.
- Downloads that were queued or mid-start when the service worker restarted are
  now persisted and resumed instead of being silently lost, which previously
  left the batch stuck below its reported total.
- Filenames derived from link text, `title`, or `aria-label` are capped at 180
  characters (extension preserved) so long labels no longer produce downloads
  the filesystem rejects.
- Filenames and path segments now have trailing dots and spaces stripped, which
  Windows rejects.
- Directory scans stop cleanly when the popup is closed mid-crawl instead of
  throwing on a disconnected port.
- The progress bar reflects files actually downloaded, so a batch that entirely
  failed no longer renders as 100% complete.
- The popup reconnects to the background worker if its port was dropped, and
  reports a failure instead of throwing when it cannot be reached.

### Added
- Directory scans now fetch up to 5 directories in parallel instead of strictly
  one at a time (roughly 3x faster on a latency-bound tree). The pool is bounded
  so the crawler does not hammer a stranger's file server, and tree order stays
  deterministic regardless of which fetch finishes first.
- A **Stop** button ends a running scan and keeps the partial tree, and the other
  scan controls lock while a crawl is in flight so a second scan cannot race the
  first.
- Directories that time out or return an error are now counted and listed in the
  scan status (hover for the URLs and reasons) instead of being silently skipped.
- The tree view's expand/collapse control is a real button: keyboard reachable,
  operable with Enter/Space, and exposing `aria-expanded`. Directory checkboxes
  carry an accessible name, and checkboxes have a visible focus ring.
- The **Scan Subdirectories** button is now offered on every page rather than
  only where the directory-listing heuristic fires, which missed many listing
  styles (S3 browsers, Caddy, h5ai, themed indexes). Detection now only controls
  whether the bar is highlighted.
- Crawl **Depth** (1-10 or unlimited) and **Max dirs** (50-5000) are selectable
  in the scan bar and remembered between sessions. Depth was previously fixed at
  5 with no way to change it, and the directory cap was fixed at 200.
- An **All file types** option collects extensions outside the supported list,
  for file servers hosting formats the extension does not know about. Pages and
  page assets stay excluded so ordinary browsing is unaffected.

### Changed
- The supported extension list grew from 16 to roughly 70, adding archives and
  disk images, more audio/video formats, data files, installers, e-books and
  fonts.
- Files are now grouped by family (Documents, Spreadsheets, Images, Archives,
  Data, Installers, Fonts, ...) instead of by individual extension, which would
  otherwise have produced dozens of one-type groups.
- Chrome and Firefox packages now use separate manifests so each browser gets
  the correct MV3 background declaration.
- Chrome package manifest no longer includes Firefox-specific Gecko metadata.
- Added `npm run validate` and `npm test` for manifest checks, JavaScript syntax
  checks, and dependency-free smoke tests.

## [1.2.0] - 2026-04-12

### Fixed
- Chrome MV3 compatibility: declared `service_worker` in `background` manifest.
- Duplicate listener registration in `content.js` when the popup reopens and
  re-injects the content script.
- In-flight batch state persists across service-worker termination via
  `chrome.storage.session`.
- Popup reconnect: download port now requests status on connect so a reopened
  popup shows ongoing progress.
- Directory scan is bounded by a total-directory cap (200) and a per-fetch
  timeout (15s) to prevent runaway scans.
- Progress panel no longer flashes when there is nothing in flight.

### Changed
- Search input now debounces renders by 120ms.
- `background.js` filename sanitization mirrors `content.js` (strips
  `Download file:` prefix).
- Directory-tree rows are clickable anywhere (not just the toggle arrow) to
  expand/collapse.

### Added
- `LICENSE` (MIT).
- `CHANGELOG.md`.
- Accessibility: `<title>` on the popup document, aria-label on the file-count
  badge.
- Copy URLs now surfaces a "Copy failed" state if the clipboard write rejects.

## [1.1.0] - 2026-04-07

- Download queue with concurrency limit, dark mode, media scanning, and other
  improvements.

## [1.0.0] - Initial release

- Scan the current page for downloadable links and media; bulk-download with
  progress tracking.
