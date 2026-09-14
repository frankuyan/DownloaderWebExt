# Browser-driven tests

`popup/popup.js` is the largest file in the extension and cannot be exercised
without a DOM, so these suites drive the real popup and content script in
Chromium via Playwright.

They are **not** part of `npm test`. The default suite
(`scripts/smoke-tests.js`) stays dependency-free so it runs anywhere with just
Node; Playwright is heavyweight and is therefore optional.

```sh
npm test          # dependency-free: manifests, syntax, pure-logic smoke tests
npm run test:ui   # these suites: needs Playwright + a Chromium build
```

If Playwright is not installed, `npm run test:ui` explains how to get it and
exits with status 2 rather than failing the build.

```sh
npm install -g playwright && npx playwright install chromium
# or point at an existing install:
PLAYWRIGHT_PATH=/path/to/playwright npm run test:ui
```

Run one suite with `node test/browser/run.js popup` (`popup`, `detection`, or
`crawl`).

## What each suite covers

| Suite | Covers |
|---|---|
| `popup.test.js` | Category grouping, selection surviving filter/sort re-renders, download payloads, progress and retry reporting, scan-control locking, the Stop flow, partial-result status text, and tree keyboard accessibility. |
| `detection.test.js` | `isDirectoryListing()` against Apache, nginx, Python `http.server`, Caddy, h5ai and table layouts, plus ordinary pages that must not be flagged. |
| `crawl.test.js` | Recursive traversal, depth and directory caps, type filtering, parallel-vs-serial equivalence and speedup, deterministic tree order, unreachable-directory reporting, and mid-crawl cancellation. |

`harness.js` includes a small directory server (generated indexes, optional
per-request latency, deliberately failing paths) so the crawler is tested over
real HTTP. It binds port 0, so repeated or parallel runs cannot collide.
