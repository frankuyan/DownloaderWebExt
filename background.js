const api = typeof browser !== "undefined" ? browser : chrome;

const MAX_CONCURRENT = 3;
const MAX_SEGMENT_LENGTH = 180;
const MAX_ATTEMPTS = 3;
const STATE_KEY = "downloadState";

// Interruptions worth another go. Everything absent from this set — a denied
// path, no disk space, bad content, a rejected request — will fail again the
// same way, and USER_CANCELED must never be retried: re-downloading something
// the user just cancelled in their download manager is the worst thing we
// could do here.
const TRANSIENT_DOWNLOAD_ERRORS = new Set([
  "NETWORK_FAILED",
  "NETWORK_TIMEOUT",
  "NETWORK_DISCONNECTED",
  "NETWORK_SERVER_DOWN",
  "SERVER_FAILED",
  "SERVER_NO_RANGE",
  "FILE_TRANSIENT_ERROR",
  "CRASH"
]);

// Only an explicitly transient error retries. An unrecognised or missing error
// falls through to the failed list for a manual retry, which is also what
// happens when the error arrives in a later event than the state change.
function isTransientError(error) {
  return typeof error === "string" && TRANSIENT_DOWNLOAD_ERRORS.has(error);
}

// Keeps a filename within filesystem limits without losing its extension.
function truncatePathSegment(segment) {
  if (segment.length <= MAX_SEGMENT_LENGTH) return segment;
  const dotIdx = segment.lastIndexOf(".");
  const ext = dotIdx > 0 && segment.length - dotIdx <= 12 ? segment.slice(dotIdx) : "";
  return segment.slice(0, Math.max(1, MAX_SEGMENT_LENGTH - ext.length)) + ext;
}

function sanitizePathSegment(segment) {
  return truncatePathSegment(
    String(segment ?? "")
      .replace(/^Download\s+file:\s*/i, "")
      .replace(/[<>:"\\|?*\x00-\x1F]/g, "_")
      .replace(/_{2,}/g, "_")
      .trim()
      // Strips trailing dots/spaces, which Windows rejects. This also empties
      // traversal segments such as "." and "..".
      .replace(/[. ]+$/, "")
      .trim()
  );
}

function sanitizeDownloadPath(path, fallback = "download") {
  const parts = String(path ?? "")
    .split(/[\\/]+/)
    .map(sanitizePathSegment)
    .filter(Boolean);
  return parts.length > 0 ? parts.join("/") : fallback;
}

let queue = [];
let active = new Map();
// Files whose downloads.download() call is in flight. Tracked as a list rather
// than a counter so they survive a service-worker restart.
let starting = [];
let completed = [];
let failed = [];
let retried = 0;
let totalInBatch = 0;
let downloadPort = null;
let loadPromise = restoreState();

async function restoreState() {
  await loadState();
  await reconcileActive();
  // A worker restart strands whatever was queued or mid-start, and no download
  // event will ever reference those files. Resume them as soon as we wake up.
  if (queue.length > 0) processQueue();
  else if (isBatchSettled()) sendProgress();
}

// Downloads that finished while the worker was gone will never fire another
// onChanged, so a restored `active` entry can be a download that is already
// over. Left alone, the batch reports those as active forever: it never
// settles, and because pending work blocks a fresh batch, every later download
// is appended to one that can no longer complete. Ask the browser instead.
async function reconcileActive() {
  if (active.size === 0 || typeof api.downloads?.search !== "function") return;

  for (const [id, file] of [...active]) {
    let items;
    try {
      items = await api.downloads.search({ id });
    } catch {
      continue;
    }

    const item = Array.isArray(items) ? items[0] : null;
    if (!item) {
      // The browser has no record of it, so nothing more is coming. Counting it
      // as failed leaves it retryable; counting it as complete would claim a
      // success we cannot support.
      active.delete(id);
      failed.push(file);
    } else if (item.state === "complete") {
      active.delete(id);
      completed.push(file);
    } else if (item.state === "interrupted") {
      active.delete(id);
      failed.push(file);
    }
  }
  saveState();
}

async function loadState() {
  try {
    const data = await api.storage.session.get(STATE_KEY);
    const s = data[STATE_KEY];
    if (!s) return;
    // Downloads interrupted mid-start are re-queued ahead of the backlog.
    queue = [...(s.starting || []), ...(s.queue || [])];
    active = new Map(s.active || []);
    completed = s.completed || [];
    failed = s.failed || [];
    retried = s.retried || 0;
    totalInBatch = s.totalInBatch || 0;
  } catch {}
}

function saveState() {
  const payload = {
    queue,
    starting,
    active: [...active],
    completed,
    failed,
    retried,
    totalInBatch
  };
  api.storage.session?.set({ [STATE_KEY]: payload }).catch(() => {});
}

function notify(msg) {
  try { downloadPort?.postMessage(msg); } catch {}
}

function sendProgress() {
  notify({
    type: "progress",
    queued: queue.length,
    active: active.size + starting.length,
    completed: completed.length,
    failed: failed.length,
    retried,
    total: totalInBatch
  });
}

function hasPendingDownloads() {
  return starting.length > 0 || active.size > 0 || queue.length > 0;
}

function isBatchSettled() {
  return totalInBatch > 0 && !hasPendingDownloads();
}

function sendDone() {
  notify({
    type: "done",
    completed: completed.length,
    total: totalInBatch,
    retried,
    failed: failed.map((f) => ({ url: f.url, filename: f.filename }))
  });
}

function removeStarting(file) {
  const idx = starting.indexOf(file);
  if (idx !== -1) starting.splice(idx, 1);
}

function processQueue() {
  while (active.size + starting.length < MAX_CONCURRENT && queue.length > 0) {
    const file = queue.shift();
    starting.push(file);
    startDownload(file);
  }
  saveState();
  sendProgress();
  if (isBatchSettled()) sendDone();
}

async function startDownload(file) {
  try {
    let filename = sanitizeDownloadPath(file.filename);
    if (file.subfolder) {
      const subfolder = sanitizeDownloadPath(file.subfolder, "");
      if (subfolder) filename = `${subfolder}/${filename}`;
    }
    // Explicit rather than relying on the browser default: two files can still
    // sanitize to the same name (different invalid characters collapsing to
    // "_"), and a same-named file may already exist on disk. Uniquify appends a
    // counter instead of overwriting either.
    const id = await api.downloads.download({
      url: file.url,
      filename,
      conflictAction: "uniquify"
    });
    removeStarting(file);
    active.set(id, file);
  } catch {
    removeStarting(file);
    failed.push(file);
  } finally {
    processQueue();
  }
}

api.downloads.onChanged.addListener(async (delta) => {
  await loadPromise;
  if (!active.has(delta.id)) return;
  const file = active.get(delta.id);

  if (delta.state) {
    if (delta.state.current === "complete") {
      active.delete(delta.id);
      completed.push(file);
      processQueue();
    } else if (delta.state.current === "interrupted") {
      active.delete(delta.id);
      const attempts = file.attempts || 1;

      if (isTransientError(delta.error?.current) && attempts < MAX_ATTEMPTS) {
        // Re-queued at the back, so the rest of the batch goes first — that
        // ordering is the spacing between attempts. The queue is persisted, so
        // a worker restart mid-retry resumes it rather than losing the file.
        queue.push({ ...file, attempts: attempts + 1 });
        retried += 1;
      } else {
        failed.push(file);
      }
      processQueue();
    }
  }
});

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "downloads") return;
  downloadPort = port;
  port.onDisconnect.addListener(() => { downloadPort = null; });

  port.onMessage.addListener(async (msg) => {
    await loadPromise;
    if (msg.action === "download") {
      const files = Array.isArray(msg.files) ? msg.files : [];
      if (files.length === 0) {
        sendProgress();
        return;
      }

      if (hasPendingDownloads()) {
        queue.push(...files);
        totalInBatch += files.length;
      } else {
        completed = [];
        failed = [];
        retried = 0;
        queue = [...files];
        totalInBatch = queue.length;
      }
      processQueue();
    } else if (msg.action === "retry") {
      // Attempt counts reset: a user asking to retry wants a fresh set of
      // tries, not the one remaining from whatever exhausted them earlier.
      const toRetry = failed.map((file) => ({ ...file, attempts: 1 }));
      failed = [];
      totalInBatch = completed.length + toRetry.length + active.size + starting.length + queue.length;
      queue.push(...toRetry);
      processQueue();
    } else if (msg.action === "status") {
      sendProgress();
      if (isBatchSettled()) sendDone();
    }
  });
});
