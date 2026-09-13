const api = typeof browser !== "undefined" ? browser : chrome;

const MAX_CONCURRENT = 3;
const MAX_SEGMENT_LENGTH = 180;
const STATE_KEY = "downloadState";

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
let totalInBatch = 0;
let downloadPort = null;
let loadPromise = restoreState();

async function restoreState() {
  await loadState();
  // A worker restart strands whatever was queued or mid-start, and no download
  // event will ever reference those files. Resume them as soon as we wake up.
  if (queue.length > 0) processQueue();
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
    const id = await api.downloads.download({ url: file.url, filename });
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
      failed.push(file);
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
        queue = [...files];
        totalInBatch = queue.length;
      }
      processQueue();
    } else if (msg.action === "retry") {
      const toRetry = [...failed];
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
