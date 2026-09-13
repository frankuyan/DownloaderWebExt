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

async function main() {
  testBackgroundPathSanitization();
  testBackgroundPathTraversalIsStripped();
  testFilenameLengthCaps();
  testContentHelpers();
  await testBackgroundConcurrency();
  await testBackgroundAppendsDownloadsWhileBusy();
  await testBackgroundResumesAfterWorkerRestart();
  await testDoneMessageCarriesBatchTotal();
  console.log("Smoke tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
