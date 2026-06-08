const api = typeof browser !== "undefined" ? browser : chrome;

const MAX_CONCURRENT = 3;
const STATE_KEY = "downloadState";

function sanitizePathSegment(segment) {
  return String(segment ?? "")
    .replace(/^Download\s+file:\s*/i, "")
    .replace(/[<>:"\\|?*\x00-\x1F]/g, "_")
    .replace(/_{2,}/g, "_")
    .trim()
    .replace(/^\.+$/, "");
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
let starting = 0;
let completed = [];
let failed = [];
let totalInBatch = 0;
let downloadPort = null;
let loadPromise = loadState();

async function loadState() {
  try {
    const data = await api.storage.session.get(STATE_KEY);
    const s = data[STATE_KEY];
    if (!s) return;
    queue = s.queue || [];
    active = new Map(s.active || []);
    completed = s.completed || [];
    failed = s.failed || [];
    totalInBatch = s.totalInBatch || 0;
  } catch {}
}

function saveState() {
  const payload = {
    queue,
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
    active: active.size + starting,
    completed: completed.length,
    failed: failed.length,
    total: totalInBatch
  });
}

function processQueue() {
  while (active.size + starting < MAX_CONCURRENT && queue.length > 0) {
    starting += 1;
    startDownload(queue.shift());
  }
  saveState();
  sendProgress();
  if (starting === 0 && active.size === 0 && queue.length === 0 && totalInBatch > 0) {
    notify({
      type: "done",
      completed: completed.length,
      failed: failed.map((f) => ({ url: f.url, filename: f.filename }))
    });
  }
}

async function startDownload(file) {
  try {
    let filename = sanitizeDownloadPath(file.filename);
    if (file.subfolder) {
      const subfolder = sanitizeDownloadPath(file.subfolder, "");
      if (subfolder) filename = `${subfolder}/${filename}`;
    }
    const id = await api.downloads.download({ url: file.url, filename });
    active.set(id, file);
    saveState();
  } catch {
    failed.push(file);
  } finally {
    starting = Math.max(0, starting - 1);
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
      completed = [];
      failed = [];
      queue = [...msg.files];
      totalInBatch = queue.length;
      processQueue();
    } else if (msg.action === "retry") {
      const toRetry = [...failed];
      failed = [];
      totalInBatch = completed.length + toRetry.length + active.size + starting + queue.length;
      queue.push(...toRetry);
      processQueue();
    } else if (msg.action === "status") {
      sendProgress();
      if (totalInBatch > 0 && starting === 0 && active.size === 0 && queue.length === 0) {
        notify({
          type: "done",
          completed: completed.length,
          failed: failed.map((f) => ({ url: f.url, filename: f.filename }))
        });
      }
    }
  });
});
