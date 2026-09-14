// Grouped so the popup can present matching categories. Keep in sync with
// CATEGORIES in popup/popup.js — scripts/smoke-tests.js asserts they match.
const EXTENSION_GROUPS = {
  documents: ["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "epub", "mobi", "djvu"],
  spreadsheets: ["xls", "xlsx", "xlsm", "ods", "csv", "tsv"],
  presentations: ["ppt", "pptx", "odp"],
  images: ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "tiff", "tif", "ico", "heic", "avif"],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "oga", "m4a", "wma", "opus", "aiff"],
  video: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg"],
  archives: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "iso", "dmg"],
  data: ["json", "xml", "yaml", "yml", "sql", "db", "sqlite", "parquet", "log"],
  installers: ["exe", "msi", "deb", "rpm", "pkg", "apk", "appimage"],
  fonts: ["ttf", "otf", "woff", "woff2"]
};

const SUPPORTED_EXTENSIONS = Object.values(EXTENSION_GROUPS).flat();

// Pages and page assets. Excluded even in "all file types" mode, where they
// would otherwise turn every navigation link into a download candidate.
const NON_FILE_EXTENSIONS = [
  "html", "htm", "xhtml", "shtml", "php", "php3", "php4", "php5", "phtml",
  "asp", "aspx", "jsp", "jspx", "cgi", "css", "js", "mjs", "cjs", "map"
];

function isDownloadableExtension(ext, includeAllTypes) {
  if (!ext) return false;
  if (includeAllTypes) return !NON_FILE_EXTENSIONS.includes(ext);
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function getFileExtension(url) {
  try {
    const pathname = new URL(url, location.href).pathname;
    const match = pathname.match(/\.(\w+)$/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function getFilename(url) {
  try {
    const pathname = new URL(url, location.href).pathname;
    return decodeURIComponent(pathname.split("/").pop()) || null;
  } catch {
    return null;
  }
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

const MAX_FILENAME_LENGTH = 180;

// Keeps a filename within filesystem limits without losing its extension.
function truncateFilename(name) {
  if (name.length <= MAX_FILENAME_LENGTH) return name;
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx > 0 && name.length - dotIdx <= 12 ? name.slice(dotIdx) : "";
  return name.slice(0, Math.max(1, MAX_FILENAME_LENGTH - ext.length)) + ext;
}

function sanitizeFilename(name) {
  const clean = truncateFilename(
    String(name ?? "")
      .replace(/^Download\s+file:\s*/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/_{2,}/g, "_")
      .trim()
      // Strips trailing dots/spaces, which Windows rejects. This also empties
      // traversal segments such as "." and "..".
      .replace(/[. ]+$/, "")
      .trim()
  );
  return clean || "download";
}

function hasSupportedExtension(filename) {
  const match = filename.match(/\.([a-z0-9]+)$/i);
  return Boolean(match && SUPPORTED_EXTENSIONS.includes(match[1].toLowerCase()));
}

function ensureExtension(filename, ext) {
  return hasSupportedExtension(filename) ? filename : `${filename}.${ext}`;
}

function getDisplayName(link, ext) {
  const dlAttr = link.getAttribute("download");
  if (dlAttr) return ensureExtension(sanitizeFilename(dlAttr), ext);

  const title = link.getAttribute("title");
  if (title && title.length > 1) {
    const clean = sanitizeFilename(title);
    return ensureExtension(clean, ext);
  }

  const text = link.textContent.trim();
  if (text && text.length > 1 && !/^[0-9a-f-]{20,}/.test(text)) {
    const clean = sanitizeFilename(text);
    return ensureExtension(clean, ext);
  }

  const aria = link.getAttribute("aria-label");
  if (aria && aria.length > 1) {
    const clean = sanitizeFilename(aria);
    return ensureExtension(clean, ext);
  }

  return ensureExtension(sanitizeFilename(getFilename(link.href) || "file"), ext);
}

function deduplicateFilenames(files) {
  const nameCount = new Map();
  for (const file of files) {
    const key = file.filename.toLowerCase();
    nameCount.set(key, (nameCount.get(key) || 0) + 1);
  }

  const nameIndex = new Map();
  return files.map((file) => {
    const key = file.filename.toLowerCase();
    if (nameCount.get(key) <= 1) return file;

    const idx = (nameIndex.get(key) || 0) + 1;
    nameIndex.set(key, idx);
    if (idx === 1) return file;

    const dotIdx = file.filename.lastIndexOf(".");
    const base = dotIdx > 0 ? file.filename.slice(0, dotIdx) : file.filename;
    const extPart = dotIdx > 0 ? file.filename.slice(dotIdx) : "";
    return { ...file, filename: `${base} (${idx})${extPart}` };
  });
}

// Recognises a generated index without requiring Apache's <pre>/<table>
// markup, which excluded div- and list-based listings (S3 browsers, Caddy,
// h5ai, themed indexes). The signals are: links resolving under the current
// directory, a parent link, subdirectory links, and link text that repeats its
// own href — all characteristic of a listing and rare together elsewhere.
//
// This only decides whether the scan bar is highlighted, so it leans towards
// recognising a listing; the scan itself is always available.
function isDirectoryListing() {
  const title = document.title || "";
  if (/index of\b/i.test(title)) return true;
  if (/^directory listing for /i.test(title)) return true;

  const links = Array.from(document.querySelectorAll("a[href]"));
  if (links.length < 3) return false;

  const path = location.pathname;
  const basePrefix = path.endsWith("/") ? path : path.slice(0, path.lastIndexOf("/") + 1);

  let underBase = 0;
  let subdirectories = 0;
  let selfDescribing = 0;
  let hasParentLink = false;

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;
    if (href === "../" || href === "..") hasParentLink = true;

    let resolved;
    try {
      resolved = new URL(href, location.href);
    } catch {
      continue;
    }
    if (resolved.origin !== location.origin) continue;
    if (!resolved.pathname.startsWith(basePrefix)) continue;

    underBase += 1;
    if (resolved.pathname.endsWith("/")) subdirectories += 1;

    const text = (link.textContent || "").trim();
    if (text && (text === href || text === safeDecode(href))) selfDescribing += 1;
  }

  const ratio = underBase / links.length;
  if (ratio > 0.5 && (hasParentLink || selfDescribing >= 3)) return true;
  return ratio > 0.7 && subdirectories >= 3;
}

function scanPage({ includeAllTypes = false } = {}) {
  const seen = new Set();
  const files = [];

  // 1. Scan <a> links
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.href;
    const ext = getFileExtension(href);
    if (isDownloadableExtension(ext, includeAllTypes) && !seen.has(href)) {
      seen.add(href);
      files.push({
        url: href,
        filename: getDisplayName(link, ext),
        type: ext,
        source: "link"
      });
    }
  }

  // 2. Scan <img> tags (skip small icons/sprites)
  for (const img of document.querySelectorAll("img[src]")) {
    const src = img.src;
    if (seen.has(src)) continue;
    const ext = getFileExtension(src);
    if (!isDownloadableExtension(ext, includeAllTypes)) continue;

    const w = img.naturalWidth || parseInt(img.getAttribute("width")) || 0;
    const h = img.naturalHeight || parseInt(img.getAttribute("height")) || 0;
    if (w > 0 && h > 0 && w < 100 && h < 100) continue;

    seen.add(src);
    const name = img.alt || img.title || getFilename(src) || `image.${ext}`;
    files.push({
      url: src,
      filename: ensureExtension(sanitizeFilename(name), ext),
      type: ext,
      source: "media"
    });
  }

  // 3. Scan <video>/<audio> and <source> tags
  for (const el of document.querySelectorAll("video[src], audio[src], video source[src], audio source[src]")) {
    const src = el.src;
    if (!src || seen.has(src)) continue;
    const ext = getFileExtension(src);
    if (!isDownloadableExtension(ext, includeAllTypes)) continue;

    seen.add(src);
    const parent = el.closest("video, audio");
    const name = el.title || parent?.title || getFilename(src) || `media.${ext}`;
    files.push({
      url: src,
      filename: ensureExtension(sanitizeFilename(name), ext),
      type: ext,
      source: "media"
    });
  }

  return { files: deduplicateFilenames(files), isDirectory: isDirectoryListing() };
}

const DEFAULT_MAX_DIRS = 200;
const DEFAULT_MAX_DEPTH = 5;
// Directories fetched in parallel. Kept low deliberately: the crawler hits a
// stranger's file server, and a wide fan-out looks like a hammering client.
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 16;
const FETCH_TIMEOUT_MS = 15000;

// Depth/limit come from the popup. Fall back to the defaults rather than to
// "unlimited" when a message omits or malforms them.
function resolveScanOptions(message) {
  const rawDepth = message.maxDepth;
  const rawDirs = message.maxDirs;
  return {
    maxDepth: rawDepth === "all"
      ? Number.MAX_SAFE_INTEGER
      : Number.isInteger(rawDepth) && rawDepth > 0 ? rawDepth : DEFAULT_MAX_DEPTH,
    maxDirs: Number.isInteger(rawDirs) && rawDirs > 0 ? rawDirs : DEFAULT_MAX_DIRS,
    concurrency: Number.isInteger(message.concurrency) && message.concurrency > 0
      ? Math.min(message.concurrency, MAX_CONCURRENCY)
      : DEFAULT_CONCURRENCY,
    includeAllTypes: Boolean(message.includeAllTypes)
  };
}

function normalizeDirectoryUrl(url) {
  const normalized = new URL(url);
  normalized.hash = "";
  if (!normalized.pathname.endsWith("/") && !hasPathExtension(normalized.pathname)) {
    normalized.pathname = `${normalized.pathname}/`;
  }
  return normalized.href;
}

function hasPathExtension(pathname) {
  const lastSegment = pathname.split("/").pop() || "";
  return /\.[^/.]+$/.test(lastSegment);
}

function getDirectoryPrefix(pathname) {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Wraps the popup port so a scan stops cleanly when the popup closes mid-crawl
// instead of throwing on postMessage to a disconnected port.
//
// "cancelled" and "disconnected" are separate: a user-requested stop still has
// to deliver the partial tree, while a closed popup cannot receive anything.
function createScanReporter(port) {
  const reporter = { cancelled: false, disconnected: false, post() {} };
  if (!port) return reporter;

  port.onDisconnect.addListener(() => {
    reporter.disconnected = true;
    reporter.cancelled = true;
  });

  reporter.post = (msg) => {
    if (reporter.disconnected) return;
    try {
      port.postMessage(msg);
    } catch {
      reporter.disconnected = true;
      reporter.cancelled = true;
    }
  };
  return reporter;
}

// Runs fn over items with a bounded number in flight, preserving input order in
// the results so the rendered tree does not depend on which fetch won.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  if (items.length === 0) return results;

  // A malformed limit falls back to serial rather than to NaN workers, which
  // would resolve immediately and silently drop every item.
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 1;
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, worker)
  );
  return results;
}

async function scanDirectory(url, basePath, depth, ctx, opts) {
  const { visited, reporter, stats } = ctx;
  if (reporter?.cancelled) return null;
  url = normalizeDirectoryUrl(url);
  if (depth > opts.maxDepth || visited.has(url)) return null;
  // Checked and claimed without awaiting in between, so concurrent workers
  // cannot both slip past the cap or crawl the same directory twice.
  if (visited.size >= opts.maxDirs) return null;
  visited.add(url);

  let html;
  try {
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) {
      stats.failed.push({ url, reason: `HTTP ${resp.status}` });
      return null;
    }
    html = await resp.text();
  } catch (err) {
    stats.failed.push({ url, reason: err?.name === "AbortError" ? "timed out" : "unreachable" });
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const links = doc.querySelectorAll("a[href]");
  const base = new URL(url);
  const basePrefix = getDirectoryPrefix(base.pathname);

  const node = {
    name: basePath || base.pathname.split("/").filter(Boolean).pop() || "/",
    path: basePrefix,
    type: "dir",
    url: url,
    children: []
  };

  const subdirs = [];

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href || href === "../" || href === "./" || href.startsWith("?") || href.startsWith("#")) continue;

    let resolved;
    try {
      resolved = new URL(href, url);
    } catch {
      continue;
    }

    resolved.hash = "";

    if (resolved.origin !== base.origin) continue;
    if (!resolved.pathname.startsWith(basePrefix)) continue;

    const ext = getFileExtension(resolved.href);

    if (resolved.pathname.endsWith("/") && !ext) {
      if (!visited.has(resolved.href)) {
        const dirName = safeDecode(resolved.pathname.split("/").filter(Boolean).pop() || "/");
        subdirs.push({ url: resolved.href, name: dirName });
      }
    } else if (isDownloadableExtension(ext, opts.includeAllTypes)) {
      const filename = ensureExtension(sanitizeFilename(getFilename(resolved.href) || "file"), ext);
      node.children.push({
        name: filename,
        path: resolved.pathname,
        type: "file",
        url: resolved.href,
        ext: ext
      });
    }
  }

  const childNodes = await mapWithConcurrency(subdirs, opts.concurrency, async (sub) => {
    if (reporter?.cancelled) return null;
    reporter?.post({ type: "progress", url: sub.url, name: sub.name, depth });
    return scanDirectory(sub.url, sub.name, depth + 1, ctx, opts);
  });

  for (const childNode of childNodes) {
    if (childNode) node.children.push(childNode);
  }

  return node;
}

const api = typeof browser !== "undefined" ? browser : chrome;

if (!window.__fileDownloaderInjected) {
  window.__fileDownloaderInjected = true;

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "scanPage") {
      sendResponse(scanPage({ includeAllTypes: Boolean(message.includeAllTypes) }));
      return true;
    }
    return false;
  });

  api.runtime.onConnect.addListener((port) => {
    if (port.name !== "directoryScan") return;

    const reporter = createScanReporter(port);

    port.onMessage.addListener(async (message) => {
      if (message.action === "cancelScan") {
        // Unwinds the in-flight crawl; the partial tree is still delivered.
        reporter.cancelled = true;
        return;
      }

      if (message.action === "scanDirectory") {
        const opts = resolveScanOptions(message);
        const ctx = { visited: new Set(), reporter, stats: { failed: [] } };
        const tree = await scanDirectory(location.href, null, 0, ctx, opts);

        reporter.post({
          type: "done",
          tree,
          truncated: ctx.visited.size >= opts.maxDirs,
          cancelled: reporter.cancelled,
          scanned: ctx.visited.size,
          failed: ctx.stats.failed.slice(0, 20),
          failedCount: ctx.stats.failed.length
        });
      }
    });
  });
}
