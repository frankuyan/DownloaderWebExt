const SUPPORTED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt",
  "png", "jpg", "jpeg", "gif", "svg",
  "zip", "rar",
  "mp3", "mp4"
];

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

function sanitizeFilename(name) {
  name = name.replace(/^Download\s+file:\s*/i, "");
  name = name.replace(/[<>:"/\\|?*]/g, "_");
  name = name.replace(/_{2,}/g, "_").trim();
  return name;
}

function getDisplayName(link, ext) {
  const dlAttr = link.getAttribute("download");
  if (dlAttr) return sanitizeFilename(dlAttr);

  const title = link.getAttribute("title");
  if (title && title.length > 1) {
    const clean = sanitizeFilename(title);
    return clean.includes(".") ? clean : `${clean}.${ext}`;
  }

  const text = link.textContent.trim();
  if (text && text.length > 1 && !/^[0-9a-f-]{20,}/.test(text)) {
    const clean = sanitizeFilename(text);
    return clean.includes(".") ? clean : `${clean}.${ext}`;
  }

  const aria = link.getAttribute("aria-label");
  if (aria && aria.length > 1) {
    const clean = sanitizeFilename(aria);
    return clean.includes(".") ? clean : `${clean}.${ext}`;
  }

  return getFilename(link.href) || `file.${ext}`;
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

function isDirectoryListing() {
  const title = document.title || "";
  if (/index of\b/i.test(title)) return true;

  const links = document.querySelectorAll("a[href]");
  if (links.length === 0) return false;

  const hasPre = document.querySelector("pre");
  const hasTable = document.querySelector("table");
  if (!hasPre && !hasTable) return false;

  let relCount = 0;
  for (const link of links) {
    const href = link.getAttribute("href");
    if (href && !href.startsWith("http") && !href.startsWith("//") && href !== "../") {
      relCount++;
    }
  }

  return relCount / links.length > 0.5;
}

function scanPage() {
  const seen = new Set();
  const files = [];

  // 1. Scan <a> links
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.href;
    const ext = getFileExtension(href);
    if (ext && SUPPORTED_EXTENSIONS.includes(ext) && !seen.has(href)) {
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
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) continue;

    const w = img.naturalWidth || parseInt(img.getAttribute("width")) || 0;
    const h = img.naturalHeight || parseInt(img.getAttribute("height")) || 0;
    if (w > 0 && h > 0 && w < 100 && h < 100) continue;

    seen.add(src);
    const name = img.alt || img.title || getFilename(src) || `image.${ext}`;
    files.push({
      url: src,
      filename: sanitizeFilename(name.includes(".") ? name : `${name}.${ext}`),
      type: ext,
      source: "media"
    });
  }

  // 3. Scan <video>/<audio> and <source> tags
  for (const el of document.querySelectorAll("video[src], audio[src], video source[src], audio source[src]")) {
    const src = el.src;
    if (!src || seen.has(src)) continue;
    const ext = getFileExtension(src);
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) continue;

    seen.add(src);
    const parent = el.closest("video, audio");
    const name = el.title || parent?.title || getFilename(src) || `media.${ext}`;
    files.push({
      url: src,
      filename: sanitizeFilename(name.includes(".") ? name : `${name}.${ext}`),
      type: ext,
      source: "media"
    });
  }

  return { files: deduplicateFilenames(files), isDirectory: isDirectoryListing() };
}

const MAX_DIRS = 200;
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function scanDirectory(url, basePath, depth, maxDepth, visited, port) {
  if (depth > maxDepth || visited.has(url)) return null;
  if (visited.size >= MAX_DIRS) return null;
  visited.add(url);

  let html;
  try {
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) return null;
    html = await resp.text();
  } catch {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const links = doc.querySelectorAll("a[href]");
  const base = new URL(url);

  const node = {
    name: basePath || base.pathname.split("/").filter(Boolean).pop() || "/",
    path: base.pathname,
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

    if (resolved.origin !== base.origin) continue;
    if (!resolved.pathname.startsWith(base.pathname)) continue;

    const ext = getFileExtension(resolved.href);

    if (href.endsWith("/") && !ext) {
      if (!visited.has(resolved.href)) {
        const dirName = decodeURIComponent(href.replace(/\/$/, ""));
        subdirs.push({ url: resolved.href, name: dirName });
      }
    } else if (ext && SUPPORTED_EXTENSIONS.includes(ext)) {
      node.children.push({
        name: getFilename(resolved.href) || `file.${ext}`,
        path: resolved.pathname,
        type: "file",
        url: resolved.href,
        ext: ext
      });
    }
  }

  for (const sub of subdirs) {
    if (port) {
      port.postMessage({ type: "progress", url: sub.url, name: sub.name, depth });
    }
    const childNode = await scanDirectory(sub.url, sub.name, depth + 1, maxDepth, visited, port);
    if (childNode) {
      node.children.push(childNode);
    }
  }

  return node;
}

const api = typeof browser !== "undefined" ? browser : chrome;

if (!window.__fileDownloaderInjected) {
  window.__fileDownloaderInjected = true;

  api.runtime.onMessage.addListener((message, _sender) => {
    if (message.action === "scanPage") {
      return Promise.resolve(scanPage());
    }
  });

  api.runtime.onConnect.addListener((port) => {
    if (port.name !== "directoryScan") return;

    port.onMessage.addListener(async (message) => {
      if (message.action === "scanDirectory") {
        const maxDepth = message.maxDepth || 5;
        const visited = new Set();
        const tree = await scanDirectory(location.href, null, 0, maxDepth, visited, port);
        port.postMessage({ type: "done", tree, truncated: visited.size >= MAX_DIRS });
      }
    });
  });
}
