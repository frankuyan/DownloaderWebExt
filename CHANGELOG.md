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

### Changed
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
