const SUPPORTED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "png", "jpg", "gif", "svg",
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
  const links = document.querySelectorAll("a[href]");
  const seen = new Set();
  const files = [];

  for (const link of links) {
    const href = link.href;
    const ext = getFileExtension(href);
    if (ext && SUPPORTED_EXTENSIONS.includes(ext) && !seen.has(href)) {
      seen.add(href);
      files.push({
        url: href,
        filename: getFilename(href) || `file.${ext}`,
        type: ext
      });
    }
  }

  return { files, isDirectory: isDirectoryListing() };
}

async function scanDirectory(url, basePath, depth, maxDepth, visited, port) {
  if (depth > maxDepth || visited.has(url)) return null;
  visited.add(url);

  let html;
  try {
    const resp = await fetch(url);
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

    // Only follow same-origin links under the current directory
    if (resolved.origin !== base.origin) continue;
    if (!resolved.pathname.startsWith(base.pathname)) continue;

    const ext = getFileExtension(resolved.href);

    if (href.endsWith("/") && !ext) {
      // It's a subdirectory
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

  // Recursively scan subdirectories
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

// Use browser namespace if available, fall back to chrome
const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "scanPage") {
    sendResponse(scanPage());
  }
});

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "directoryScan") return;

  port.onMessage.addListener(async (message) => {
    if (message.action === "scanDirectory") {
      const maxDepth = message.maxDepth || 5;
      const visited = new Set();
      const tree = await scanDirectory(location.href, null, 0, maxDepth, visited, port);
      port.postMessage({ type: "done", tree });
    }
  });
});
