#!/usr/bin/env node

const fs = require("fs");
const vm = require("vm");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runBackground(scriptOverrides = {}) {
  let connectListener;
  let changedListener;
  let nextId = 1;
  const started = [];

  const chrome = {
    storage: scriptOverrides.storage ?? {
      session: {
        async get() {
          return {};
        },
        set() {
          return Promise.resolve();
        }
      }
    },
    downloads: {
      download(file) {
        const id = nextId++;
        started.push({ id, file });
        if (scriptOverrides.downloadNeverResolves) return new Promise(() => {});
        return new Promise((resolve) => setTimeout(() => resolve(id), 20));
      },
      onChanged: {
        addListener(fn) {
          changedListener = fn;
        }
      }
    },
    runtime: {
      onConnect: {
        addListener(fn) {
          connectListener = fn;
        }
      }
    }
  };

  const context = {
    chrome,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Map
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("background.js", "utf8"), context);

  const messages = [];
  const port = {
    name: "downloads",
    postMessage(msg) {
      messages.push(msg);
    },
    onDisconnect: {
      addListener() {}
    },
    onMessage: {
      addListener(fn) {
        this.listener = fn;
      }
    }
  };

  connectListener(port);
  return { context, port, started, messages, changedListener: () => changedListener };
}

async function testBackgroundConcurrency() {
  const { port, started, changedListener } = runBackground();

  port.onMessage.listener({
    action: "download",
    files: Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.test/${i}.txt`,
      filename: `file-${i}.txt`
    }))
  });

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert(started.length === 3, `Expected 3 active download starts, got ${started.length}`);

  await changedListener()({ id: 1, state: { current: "complete" } });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert(started.length === 4, `Expected one replacement download after completion, got ${started.length}`);
}

async function testBackgroundAppendsDownloadsWhileBusy() {
  const { port, started, messages, changedListener } = runBackground();

  port.onMessage.listener({
    action: "download",
    files: Array.from({ length: 4 }, (_, i) => ({
      url: `https://example.test/original-${i}.txt`,
      filename: `original-${i}.txt`
    }))
  });

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert(started.length === 3, `Expected initial batch to start 3 downloads, got ${started.length}`);

  port.onMessage.listener({
    action: "download",
    files: Array.from({ length: 2 }, (_, i) => ({
      url: `https://example.test/added-${i}.txt`,
      filename: `added-${i}.txt`
    }))
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(started.length === 3, `Expected appended files to wait for an open slot, got ${started.length} starts`);
  assert(messages.some((msg) => msg.type === "progress" && msg.total === 6), "Appended files should increase the active batch total");

  await changedListener()({ id: 1, state: { current: "complete" } });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert(started.length === 4, `Expected original queued file to start first, got ${started.length} starts`);
  assert(started[3].file.filename === "original-3.txt", "Existing queue order should be preserved before appended files");

  await changedListener()({ id: 2, state: { current: "complete" } });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert(started.length === 5, `Expected first appended file to start after original queue, got ${started.length} starts`);
  assert(started[4].file.filename === "added-0.txt", "Appended files should start after the existing queue");
}

async function testDownloadsNeverOverwrite() {
  const { port, started } = runBackground();
  port.onMessage.listener({
    action: "download",
    files: [{ url: "https://example.test/a.txt", filename: "a.txt" }]
  });
  await tick(40);

  assert(started.length === 1, "The file should have started");
  assert(
    started[0].file.conflictAction === "uniquify",
    `Downloads must not silently overwrite; got conflictAction=${started[0].file.conflictAction}`
  );
}

function testBackgroundPathSanitization() {
  const { context } = runBackground({ storage: {} });

  assert(context.sanitizeDownloadPath("../bad:name?.pdf") === "bad_name_.pdf", "Invalid path segments should be sanitized");
  assert(context.sanitizeDownloadPath("folder/sub/report.pdf") === "folder/sub/report.pdf", "Valid subpaths should be preserved");
  assert(context.sanitizeDownloadPath("////") === "download", "Empty paths should use fallback filename");
}

function runContent() {
  let messageListener;
  const context = {
    chrome: {
      runtime: {
        onMessage: {
          addListener(fn) {
            messageListener = fn;
          }
        },
        onConnect: {
          addListener() {}
        }
      }
    },
    window: {},
    location: { href: "https://example.test/files/" },
    URL,
    DOMParser: function DOMParser() {},
    AbortController,
    setTimeout,
    clearTimeout,
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("content.js", "utf8"), context);
  return { context, messageListener };
}

function testContentHelpers() {
  const { context, messageListener } = runContent();

  assert(context.sanitizeFilename("Download file: report:name?.pdf") === "report_name_.pdf", "Filename sanitizer should remove prefixes and invalid characters");
  assert(context.ensureExtension("report.v1", "pdf") === "report.v1.pdf", "Unsupported dotted suffixes should still get the detected extension");
  assert(context.ensureExtension("report.PDF", "pdf") === "report.PDF", "Supported extensions should be preserved");
  assert(context.getDirectoryPrefix("/files") === "/files/", "Directory prefixes should be normalized with a trailing slash");
  assert(context.normalizeDirectoryUrl("https://example.test/files/#top") === "https://example.test/files/", "Directory URLs should drop fragments");
  assert(context.normalizeDirectoryUrl("https://example.test/files#top") === "https://example.test/files/", "Directory-like URLs should gain a trailing slash");
  assert(context.normalizeDirectoryUrl("https://example.test/index.html#top") === "https://example.test/index.html", "File-like URLs should not gain a trailing slash");
  assert(typeof messageListener === "function", "Content script should register a message listener");
}

function testBackgroundPathTraversalIsStripped() {
  const { context } = runBackground({ storage: {} });
  const { sanitizeDownloadPath } = context;

  assert(sanitizeDownloadPath("../../etc/passwd") === "etc/passwd", "Parent-directory segments should be dropped");
  assert(sanitizeDownloadPath("a/./b/../c.pdf") === "a/b/c.pdf", "Dot segments should be dropped from the middle of a path");
  assert(sanitizeDownloadPath("..") === "download", "A path made only of traversal segments should fall back");
  assert(sanitizeDownloadPath("report.pdf.") === "report.pdf", "Trailing dots, which Windows rejects, should be stripped");
  assert(sanitizeDownloadPath("report.pdf ") === "report.pdf", "Trailing spaces, which Windows rejects, should be stripped");
  assert(sanitizeDownloadPath(".gitignore") === ".gitignore", "Leading dots should be preserved");
}

function testFilenameLengthCaps() {
  const { context: background } = runBackground({ storage: {} });
  const { context: content } = runContent();

  const longName = `${"a".repeat(400)}.pdf`;

  const fromContent = content.sanitizeFilename(longName);
  assert(fromContent.length <= 180, `Content filenames should be capped, got ${fromContent.length}`);
  assert(fromContent.endsWith(".pdf"), "Truncation should preserve the extension");

  const fromBackground = background.sanitizeDownloadPath(longName);
  assert(fromBackground.length <= 180, `Background filenames should be capped, got ${fromBackground.length}`);
  assert(fromBackground.endsWith(".pdf"), "Truncation should preserve the extension");

  const noExtension = "b".repeat(400);
  assert(content.sanitizeFilename(noExtension).length === 180, "Extensionless names should be truncated to the cap");
}

// storage.session survives a service-worker restart, so a fresh worker must pick
// the queue back up.
function createSessionStorage() {
  const store = {};
  return {
    session: {
      async get(key) {
        return key in store ? { [key]: store[key] } : {};
      },
      set(obj) {
        Object.assign(store, obj);
        return Promise.resolve();
      }
    },
    read: () => store.downloadState
  };
}

async function testBackgroundResumesAfterWorkerRestart() {
  const storage = createSessionStorage();
  const files = Array.from({ length: 5 }, (_, i) => ({
    url: `https://example.test/${i}.txt`,
    filename: `file-${i}.txt`
  }));

  // First worker: three downloads are mid-start when the worker is torn down.
  const first = runBackground({ storage, downloadNeverResolves: true });
  first.port.onMessage.listener({ action: "download", files });
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert(first.started.length === 3, `Expected 3 in-flight starts, got ${first.started.length}`);
  const saved = storage.read();
  assert(saved.starting.length === 3, "In-flight downloads must be persisted, not held only in memory");
  assert(saved.queue.length === 2, `Expected 2 files still queued, got ${saved.queue.length}`);
  assert(saved.totalInBatch === 5, "Batch total should be persisted");

  // Second worker boots from the persisted state and resumes on its own.
  const second = runBackground({ storage });
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert(second.started.length === 3, `Restarted worker should resume downloads, got ${second.started.length}`);
  const resumed = second.started.map((s) => s.file.filename);
  assert(
    resumed.join(",") === "file-0.txt,file-1.txt,file-2.txt",
    `Interrupted downloads should restart before the backlog, got ${resumed.join(",")}`
  );
}

async function testDoneMessageCarriesBatchTotal() {
  const { port, messages, changedListener } = runBackground();

  port.onMessage.listener({
    action: "download",
    files: [{ url: "https://example.test/a.txt", filename: "a.txt" }]
  });
  await new Promise((resolve) => setTimeout(resolve, 40));

  await changedListener()({ id: 1, state: { current: "complete" } });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const done = messages.find((msg) => msg.type === "done");
  assert(done, "A settled batch should emit a done message");
  assert(done.total === 1, `Done message should report the batch total, got ${done.total}`);
  assert(done.completed === 1, `Done message should report completions, got ${done.completed}`);
}

// Top-level `const` bindings do not land on a vm context, and popup.js cannot be
// executed here at all (it needs a DOM), so these literals are read out of the
// source to check the two lists stay aligned.
function extractLiteral(source, name, open, close) {
  const marker = `const ${name} = ${open}`;
  const start = source.indexOf(marker);
  assert(start !== -1, `Could not find ${name}`);

  const literalStart = start + marker.length - 1;
  let depth = 0;
  for (let i = literalStart; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close) {
      depth--;
      if (depth === 0) {
        return vm.runInNewContext(`(${source.slice(literalStart, i + 1)})`);
      }
    }
  }
  throw new Error(`Unterminated ${name} literal`);
}

function testCategoryListsStayInSync() {
  const contentSource = fs.readFileSync("content.js", "utf8");
  const popupSource = fs.readFileSync("popup/popup.js", "utf8");
  const groups = extractLiteral(contentSource, "EXTENSION_GROUPS", "{", "}");
  const categories = extractLiteral(popupSource, "CATEGORIES", "{", "}");
  const order = extractLiteral(popupSource, "CATEGORY_ORDER", "[", "]");
  const icons = extractLiteral(popupSource, "CATEGORY_ICONS", "{", "}");

  const contentExts = Object.values(groups).flat().sort();
  const popupExts = Object.values(categories).flat().sort();
  assert(
    contentExts.join(",") === popupExts.join(","),
    "content.js EXTENSION_GROUPS and popup CATEGORIES must cover the same extensions"
  );

  const duplicates = popupExts.filter((ext, i) => popupExts[i - 1] === ext);
  assert(duplicates.length === 0, `An extension is in two categories: ${duplicates.join(",")}`);

  for (const cat of Object.keys(categories)) {
    assert(order.includes(cat), `CATEGORY_ORDER is missing ${cat}`);
    assert(icons[cat], `CATEGORY_ICONS is missing ${cat}`);
  }
  assert(order.includes("Other") && icons.Other, "The Other fallback category must be ordered and have an icon");
}

function testExtensionFiltering() {
  const { context } = runContent();
  const { isDownloadableExtension } = context;

  assert(isDownloadableExtension("pdf", false), "Allowlisted extensions should be collected");
  assert(isDownloadableExtension("iso", false), "The broadened allowlist should include archives/disk images");
  assert(!isDownloadableExtension("bin", false), "Unlisted extensions should be skipped by default");
  assert(!isDownloadableExtension(null, false), "A missing extension is never downloadable");

  assert(isDownloadableExtension("bin", true), "All-types mode should accept unlisted extensions");
  assert(!isDownloadableExtension("html", true), "All-types mode must still skip pages");
  assert(!isDownloadableExtension("php", true), "All-types mode must still skip server-rendered pages");
  assert(!isDownloadableExtension("css", true), "All-types mode must still skip page assets");
  assert(!isDownloadableExtension(null, true), "A missing extension is never downloadable");
}

function testScanOptionResolution() {
  const { context } = runContent();
  const { resolveScanOptions } = context;

  const defaults = resolveScanOptions({});
  assert(defaults.maxDepth === 5, `Depth should default to 5, got ${defaults.maxDepth}`);
  assert(defaults.maxDirs === 200, `Directory cap should default to 200, got ${defaults.maxDirs}`);
  assert(defaults.includeAllTypes === false, "All-types should default to off");

  assert(resolveScanOptions({ maxDepth: 2 }).maxDepth === 2, "An explicit depth should be honoured");
  assert(resolveScanOptions({ maxDepth: "all" }).maxDepth === Number.MAX_SAFE_INTEGER, "Depth 'all' should lift the limit");
  assert(resolveScanOptions({ maxDirs: 1000 }).maxDirs === 1000, "An explicit directory cap should be honoured");
  assert(resolveScanOptions({ includeAllTypes: true }).includeAllTypes === true, "All-types should pass through");

  // Malformed values must fall back to the defaults, never to "unlimited".
  assert(resolveScanOptions({ maxDepth: 0 }).maxDepth === 5, "Depth 0 should fall back to the default");
  assert(resolveScanOptions({ maxDepth: -1 }).maxDepth === 5, "A negative depth should fall back to the default");
  assert(resolveScanOptions({ maxDepth: "deep" }).maxDepth === 5, "A non-numeric depth should fall back to the default");
  assert(resolveScanOptions({ maxDirs: 0 }).maxDirs === 200, "A zero directory cap should fall back to the default");
}

async function testConcurrencyHelper() {
  const { context } = runContent();
  const { mapWithConcurrency } = context;

  // Slowest item first, so a result order matching the input proves the helper
  // reorders by index rather than by completion.
  const delays = [30, 5, 20, 1, 10];
  const ordered = await mapWithConcurrency(delays, 3, async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms;
  });
  assert(ordered.join(",") === delays.join(","), `Results must keep input order, got ${ordered.join(",")}`);

  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });
  assert(peak <= 4, `Concurrency limit exceeded: peak was ${peak}`);
  assert(peak === 4, `The limit should be saturated, peak was ${peak}`);

  const empty = await mapWithConcurrency([], 4, async () => 1);
  assert(empty.length === 0, "Empty input should produce no results and not hang");

  // A bad limit must degrade to serial, never to zero workers silently
  // resolving and dropping every item.
  for (const badLimit of [undefined, null, NaN, 0, -3, "5", 2.5]) {
    const out = await mapWithConcurrency([1, 2, 3], badLimit, async (n) => n * 2);
    assert(
      out.join(",") === "2,4,6",
      `A limit of ${String(badLimit)} must still process every item, got ${out.join(",")}`
    );
  }
}

function testConcurrencyOption() {
  const { context } = runContent();
  const { resolveScanOptions } = context;

  assert(resolveScanOptions({}).concurrency === 5, "Concurrency should default to 5");
  assert(resolveScanOptions({ concurrency: 2 }).concurrency === 2, "An explicit concurrency should be honoured");
  assert(resolveScanOptions({ concurrency: 500 }).concurrency === 16, "Concurrency should be clamped so the crawler cannot hammer a server");
  assert(resolveScanOptions({ concurrency: 0 }).concurrency === 5, "Invalid concurrency should fall back to the default");
}

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startOneFile(port) {
  port.onMessage.listener({
    action: "download",
    files: [{ url: "https://example.test/flaky.txt", filename: "flaky.txt" }]
  });
}

function lastDone(messages) {
  return messages.filter((msg) => msg.type === "done").pop();
}

async function testTransientFailuresAreRetried() {
  const { port, started, messages, changedListener } = runBackground();
  startOneFile(port);
  await tick(40);
  assert(started.length === 1, `Expected the file to start once, got ${started.length}`);

  await changedListener()({ id: 1, state: { current: "interrupted" }, error: { current: "NETWORK_FAILED" } });
  await tick(40);
  assert(started.length === 2, "A transient network failure should be retried automatically");

  await changedListener()({ id: 2, state: { current: "interrupted" }, error: { current: "SERVER_FAILED" } });
  await tick(40);
  assert(started.length === 3, "A second transient failure should be retried automatically");

  await changedListener()({ id: 3, state: { current: "interrupted" }, error: { current: "NETWORK_TIMEOUT" } });
  await tick(40);
  assert(started.length === 3, `Retries must stop at MAX_ATTEMPTS, got ${started.length} starts`);

  const done = lastDone(messages);
  assert(done, "A settled batch should report done");
  assert(done.failed.length === 1, `The exhausted file should be reported failed, got ${done.failed.length}`);
  assert(done.retried === 2, `Expected 2 retries to be reported, got ${done.retried}`);
  assert(done.total === 1, `Retries must not inflate the batch total, got ${done.total}`);
  assert(done.completed === 0, "Nothing completed in this batch");
}

async function testNonTransientFailuresAreNotRetried() {
  const cases = [
    ["USER_CANCELED", "a user cancellation must never be re-downloaded"],
    ["FILE_ACCESS_DENIED", "a denied path will fail again the same way"],
    ["SERVER_BAD_CONTENT", "bad content is not transient"],
    [undefined, "an unknown error should fall through to manual retry"]
  ];

  for (const [error, why] of cases) {
    const { port, started, messages, changedListener } = runBackground();
    startOneFile(port);
    await tick(40);

    const delta = { id: 1, state: { current: "interrupted" } };
    if (error !== undefined) delta.error = { current: error };
    await changedListener()(delta);
    await tick(40);

    assert(started.length === 1, `${String(error)}: should not be retried — ${why}`);
    const done = lastDone(messages);
    assert(done.failed.length === 1, `${String(error)}: should be reported as failed`);
    assert(done.retried === 0, `${String(error)}: should report no retries`);
  }
}

async function testManualRetryResetsAttempts() {
  const { port, started, changedListener } = runBackground();
  startOneFile(port);
  await tick(40);

  // Burn all three automatic attempts.
  for (const id of [1, 2, 3]) {
    await changedListener()({ id, state: { current: "interrupted" }, error: { current: "NETWORK_FAILED" } });
    await tick(40);
  }
  assert(started.length === 3, `Expected 3 automatic attempts, got ${started.length}`);

  // A manual retry should get its own full allowance, not the exhausted count.
  port.onMessage.listener({ action: "retry" });
  await tick(40);
  assert(started.length === 4, `Manual retry should start the file again, got ${started.length}`);

  await changedListener()({ id: 4, state: { current: "interrupted" }, error: { current: "NETWORK_FAILED" } });
  await tick(40);
  assert(started.length === 5, "A manual retry should restore automatic retries, not spend its last attempt");
}

function testTransientErrorClassification() {
  const { context } = runBackground({ storage: {} });
  const { isTransientError } = context;

  for (const err of ["NETWORK_FAILED", "NETWORK_TIMEOUT", "SERVER_FAILED", "CRASH"]) {
    assert(isTransientError(err), `${err} should be treated as transient`);
  }
  for (const err of ["USER_CANCELED", "USER_SHUTDOWN", "FILE_NO_SPACE", "SERVER_FORBIDDEN", "", null, undefined, 7]) {
    assert(!isTransientError(err), `${String(err)} must not be treated as transient`);
  }
}

async function main() {
  testBackgroundPathSanitization();
  testBackgroundPathTraversalIsStripped();
  testFilenameLengthCaps();
  testContentHelpers();
  testCategoryListsStayInSync();
  testExtensionFiltering();
  testScanOptionResolution();
  testConcurrencyOption();
  await testConcurrencyHelper();
  await testBackgroundConcurrency();
  await testBackgroundAppendsDownloadsWhileBusy();
  await testBackgroundResumesAfterWorkerRestart();
  await testDownloadsNeverOverwrite();
  testTransientErrorClassification();
  await testTransientFailuresAreRetried();
  await testNonTransientFailuresAreNotRetried();
  await testManualRetryResetsAttempts();
  await testDoneMessageCarriesBatchTotal();
  console.log("Smoke tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
