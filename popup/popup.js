const api = typeof browser !== "undefined" ? browser : chrome;

// --- Constants ---
const CATEGORIES = {
  PDF: ["pdf"],
  DOC: ["doc", "docx"],
  XLS: ["xls", "xlsx"],
  PPT: ["ppt", "pptx"],
  TXT: ["txt"],
  PNG: ["png"],
  JPG: ["jpg", "jpeg"],
  GIF: ["gif"],
  SVG: ["svg"],
  MP3: ["mp3"],
  MP4: ["mp4"],
  ZIP: ["zip"],
  RAR: ["rar"]
};

const TYPE_ICONS = {
  pdf: "\u{1F4C4}", doc: "\u{1F4DD}", docx: "\u{1F4DD}", txt: "\u{1F4DD}",
  xls: "\u{1F4CA}", xlsx: "\u{1F4CA}", ppt: "\u{1F4CA}", pptx: "\u{1F4CA}",
  png: "\u{1F5BC}", jpg: "\u{1F5BC}", jpeg: "\u{1F5BC}", gif: "\u{1F5BC}", svg: "\u{1F5BC}",
  mp3: "\u{1F3B5}", mp4: "\u{1F3AC}", zip: "\u{1F4E6}", rar: "\u{1F4E6}"
};

const CATEGORY_ORDER = [
  "PDF", "DOC", "XLS", "PPT", "TXT",
  "PNG", "JPG", "GIF", "SVG",
  "MP3", "MP4", "ZIP", "RAR", "Other"
];

// --- State ---
let allFiles = [];
let treeData = null;
let isTreeMode = false;
let downloadPort = null;
let typePreferences = {};
let activeTabId = null;

// --- DOM refs ---
const fileListEl = document.getElementById("fileList");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const badgeEl = document.getElementById("badge");
const searchEl = document.getElementById("search");
const sortSelect = document.getElementById("sortSelect");
const downloadBtn = document.getElementById("downloadBtn");
const copyUrlsBtn = document.getElementById("copyUrls");
const subfolderEl = document.getElementById("subfolder");
const scanDirBar = document.getElementById("scanDirBar");
const scanDirBtn = document.getElementById("scanDirBtn");
const scanStatus = document.getElementById("scanStatus");
const progressContainer = document.getElementById("downloadProgress");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const retryBtn = document.getElementById("retryBtn");

// --- Utility ---
function getCategoryForType(type) {
  for (const [cat, types] of Object.entries(CATEGORIES)) {
    if (types.includes(type)) return cat;
  }
  return "Other";
}

function getSelectedFiles() {
  const checked = fileListEl.querySelectorAll(".file-checkbox:checked");
  return Array.from(checked).map((cb) => ({
    url: cb.dataset.url,
    filename: cb.dataset.filename
  }));
}

function updateDownloadBtn() {
  const count = getSelectedFiles().length;
  downloadBtn.disabled = count === 0;
  downloadBtn.textContent = count > 0 ? `Download Selected (${count})` : "Download Selected";
}

function updateGroupCheckbox(groupEl) {
  const checkboxes = groupEl.querySelectorAll(".file-checkbox");
  const groupCb = groupEl.querySelector(".group-checkbox");
  if (!groupCb) return;
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  const someChecked = Array.from(checkboxes).some((cb) => cb.checked);
  groupCb.checked = allChecked;
  groupCb.indeterminate = someChecked && !allChecked;
}

function sortFileList(files) {
  const method = sortSelect.value;
  if (method === "name-asc") return [...files].sort((a, b) => a.filename.localeCompare(b.filename));
  if (method === "name-desc") return [...files].sort((a, b) => b.filename.localeCompare(a.filename));
  return files;
}

function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// --- Type Preferences (storage API) ---
async function loadPreferences() {
  try {
    const data = await api.storage.local.get("typePreferences");
    typePreferences = data.typePreferences || {};
  } catch {
    typePreferences = {};
  }
}

function savePreference(category, checked) {
  typePreferences[category] = checked;
  api.storage.local.set({ typePreferences }).catch(() => {});
}

// --- Badge on extension icon ---
function setBadge(count) {
  try {
    const text = count > 0 ? String(count) : "";
    api.action.setBadgeText({ text, tabId: activeTabId });
    api.action.setBadgeBackgroundColor({ color: "#2563eb", tabId: activeTabId });
  } catch {}
}

// --- Render: Flat file list ---
function renderFiles(filter = "") {
  fileListEl.querySelectorAll(".group-section").forEach((el) => el.remove());

  const lowerFilter = filter.toLowerCase();
  const grouped = {};

  for (const file of allFiles) {
    if (lowerFilter && !file.filename.toLowerCase().includes(lowerFilter)) continue;
    const cat = getCategoryForType(file.type);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(file);
  }

  for (const cat of Object.keys(grouped)) {
    grouped[cat] = sortFileList(grouped[cat]);
  }

  let anyVisible = false;

  for (const cat of CATEGORY_ORDER) {
    const files = grouped[cat];
    if (!files || files.length === 0) continue;
    anyVisible = true;

    const section = document.createElement("div");
    section.className = "group-section";

    const header = document.createElement("label");
    header.className = "group-header";
    const groupCb = document.createElement("input");
    groupCb.type = "checkbox";
    groupCb.className = "group-checkbox";
    if (typePreferences[cat]) groupCb.checked = true;
    header.appendChild(groupCb);
    header.appendChild(document.createTextNode(`${cat} (${files.length})`));
    section.appendChild(header);

    for (const file of files) {
      const item = document.createElement("label");
      item.className = "file-item";
      item.title = file.url;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "file-checkbox";
      cb.dataset.url = file.url;
      cb.dataset.filename = file.filename;
      if (typePreferences[cat]) cb.checked = true;
      cb.addEventListener("change", () => {
        updateGroupCheckbox(section);
        updateDownloadBtn();
      });

      const icon = document.createElement("span");
      icon.className = "file-icon";
      icon.textContent = TYPE_ICONS[file.type] || "\u{1F4CE}";

      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = file.filename;
      name.title = file.filename;

      const ext = document.createElement("span");
      ext.className = "file-ext";
      ext.textContent = file.type;

      item.append(cb, icon, name);

      if (file.source === "media") {
        const tag = document.createElement("span");
        tag.className = "source-tag";
        tag.textContent = "media";
        item.appendChild(tag);
      }

      item.appendChild(ext);
      section.appendChild(item);
    }

    groupCb.addEventListener("change", () => {
      const checkboxes = section.querySelectorAll(".file-checkbox");
      checkboxes.forEach((cb) => (cb.checked = groupCb.checked));
      savePreference(cat, groupCb.checked);
      updateDownloadBtn();
    });

    fileListEl.appendChild(section);
  }

  emptyEl.classList.toggle("hidden", anyVisible);
  updateDownloadBtn();
}

// --- Tree View ---

function countFiles(node) {
  if (node.type === "file") return 1;
  let count = 0;
  for (const child of node.children) count += countFiles(child);
  return count;
}

function nodeMatchesFilter(node, filter) {
  if (node.type === "file") return node.name.toLowerCase().includes(filter);
  return node.children.some((child) => nodeMatchesFilter(child, filter));
}

function getTreeDownloadPath(node) {
  if (!treeData?.path || !node.path) return node.name;

  const rootPath = treeData.path.endsWith("/") ? treeData.path : `${treeData.path}/`;
  if (!node.path.startsWith(rootPath)) return node.name;

  return decodePath(node.path.slice(rootPath.length)) || node.name;
}

function updateDirCheckbox(dirEl) {
  const fileCheckboxes = dirEl.querySelectorAll(".file-checkbox");
  const dirCb = dirEl.querySelector(":scope > .dir-node > .dir-checkbox");
  if (!dirCb || fileCheckboxes.length === 0) return;
  const allChecked = Array.from(fileCheckboxes).every((cb) => cb.checked);
  const someChecked = Array.from(fileCheckboxes).some((cb) => cb.checked);
  dirCb.checked = allChecked;
  dirCb.indeterminate = someChecked && !allChecked;
}

function updateAncestorCheckboxes(el) {
  let node = el.closest(".tree-node");
  while (node) {
    updateDirCheckbox(node);
    node = node.parentElement?.closest(".tree-node");
  }
}

function renderTreeNode(node, depth, filter) {
  if (filter && !nodeMatchesFilter(node, filter)) return null;

  if (node.type === "file") {
    const item = document.createElement("label");
    item.className = "tree-file";
    item.style.paddingLeft = `${depth * 16 + 6}px`;
    item.title = node.url;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "file-checkbox";
    cb.dataset.url = node.url;
    cb.dataset.filename = getTreeDownloadPath(node);
    cb.addEventListener("change", () => {
      updateAncestorCheckboxes(cb);
      updateDownloadBtn();
    });

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = TYPE_ICONS[node.ext] || "\u{1F4CE}";

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = node.name;
    name.title = node.name;

    const ext = document.createElement("span");
    ext.className = "file-ext";
    ext.textContent = node.ext;

    item.append(cb, icon, name, ext);
    return item;
  }

  // Directory node
  const container = document.createElement("div");
  container.className = "tree-node";

  const dirRow = document.createElement("div");
  dirRow.className = "dir-node";
  dirRow.style.paddingLeft = `${depth * 16 + 6}px`;

  const toggle = document.createElement("span");
  toggle.className = "tree-toggle";
  toggle.textContent = "\u25BC";

  const dirCb = document.createElement("input");
  dirCb.type = "checkbox";
  dirCb.className = "dir-checkbox";

  const dirIcon = document.createElement("span");
  dirIcon.className = "dir-icon";
  dirIcon.textContent = "\u{1F4C2}";

  const dirName = document.createElement("span");
  dirName.className = "dir-name";
  dirName.textContent = node.name;

  const fileCount = countFiles(node);
  const countSpan = document.createElement("span");
  countSpan.className = "dir-count";
  countSpan.textContent = `${fileCount} file${fileCount !== 1 ? "s" : ""}`;

  dirRow.append(toggle, dirCb, dirIcon, dirName, countSpan);
  container.appendChild(dirRow);

  const childrenContainer = document.createElement("div");
  childrenContainer.className = "tree-children";

  const dirs = node.children.filter((c) => c.type === "dir");
  let files = node.children.filter((c) => c.type === "file");

  // Sort files in tree view
  const method = sortSelect.value;
  if (method === "name-asc") files.sort((a, b) => a.name.localeCompare(b.name));
  else if (method === "name-desc") files.sort((a, b) => b.name.localeCompare(a.name));

  for (const child of [...dirs, ...files]) {
    const childEl = renderTreeNode(child, depth + 1, filter);
    if (childEl) childrenContainer.appendChild(childEl);
  }

  if (filter && childrenContainer.children.length === 0) return null;

  container.appendChild(childrenContainer);

  const toggleExpand = () => {
    const isCollapsed = childrenContainer.classList.toggle("collapsed");
    toggle.classList.toggle("collapsed", isCollapsed);
    dirIcon.textContent = isCollapsed ? "\u{1F4C1}" : "\u{1F4C2}";
  };

  dirRow.addEventListener("click", (e) => {
    if (e.target === dirCb) return;
    e.stopPropagation();
    toggleExpand();
  });

  dirCb.addEventListener("change", () => {
    const fileCheckboxes = childrenContainer.querySelectorAll(".file-checkbox");
    fileCheckboxes.forEach((cb) => (cb.checked = dirCb.checked));
    const childDirCbs = childrenContainer.querySelectorAll(".dir-checkbox");
    childDirCbs.forEach((cb) => {
      cb.checked = dirCb.checked;
      cb.indeterminate = false;
    });
    updateAncestorCheckboxes(dirCb);
    updateDownloadBtn();
  });

  return container;
}

function renderTree(filter = "") {
  fileListEl.querySelectorAll(".group-section, .tree-node").forEach((el) => el.remove());
  if (!treeData) return;

  const lowerFilter = filter.toLowerCase();
  const treeEl = renderTreeNode(treeData, 0, lowerFilter || "");

  if (treeEl) {
    fileListEl.appendChild(treeEl);
    emptyEl.classList.add("hidden");
  } else {
    emptyEl.classList.remove("hidden");
  }
  updateDownloadBtn();
}

function render(filter) {
  if (isTreeMode && treeData) {
    renderTree(filter);
  } else {
    renderFiles(filter);
  }
}

// --- Download Management (port-based) ---

function connectDownloadPort() {
  downloadPort = api.runtime.connect({ name: "downloads" });
  downloadPort.onMessage.addListener((msg) => {
    if (msg.type === "progress") showProgress(msg);
    else if (msg.type === "done") showDownloadDone(msg);
  });
  downloadPort.onDisconnect.addListener(() => { downloadPort = null; });
  downloadPort.postMessage({ action: "status" });
}

function showProgress({ completed, failed, active, queued, total }) {
  if (total === 0) return;
  progressContainer.classList.remove("hidden");
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;

  let text = `${completed}/${total} completed`;
  if (active > 0) text += ` \u00B7 ${active} active`;
  if (queued > 0) text += ` \u00B7 ${queued} queued`;
  progressText.textContent = text;

  retryBtn.classList.toggle("hidden", failed === 0);
  if (failed > 0) retryBtn.textContent = `Retry Failed (${failed})`;
}

function showDownloadDone({ completed, failed }) {
  progressBar.style.width = "100%";

  if (failed.length > 0) {
    progressText.textContent = `Done: ${completed} downloaded, ${failed.length} failed`;
    retryBtn.classList.remove("hidden");
    retryBtn.textContent = `Retry Failed (${failed.length})`;
  } else {
    progressText.textContent = `Done: ${completed} downloaded`;
    retryBtn.classList.add("hidden");
    setTimeout(() => progressContainer.classList.add("hidden"), 3000);
  }

  downloadBtn.disabled = false;
  updateDownloadBtn();
}

// --- Scan Workflow ---

async function scanActiveTab() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab.id;

    let response;
    try {
      response = await api.tabs.sendMessage(tab.id, { action: "scanPage" });
    } catch {
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/content.js"]
      });
      response = await api.tabs.sendMessage(tab.id, { action: "scanPage" });
    }
    allFiles = response?.files || response || [];
    const isDirectory = response?.isDirectory || false;

    if (isDirectory) scanDirBar.classList.remove("hidden");
  } catch (err) {
    console.error("Scan failed:", err);
    allFiles = [];
  }

  loadingEl.classList.add("hidden");

  if (allFiles.length > 0) {
    badgeEl.textContent = allFiles.length;
    badgeEl.classList.remove("hidden");
    setBadge(allFiles.length);
  } else {
    badgeEl.textContent = "0";
    badgeEl.classList.add("hidden");
    setBadge(0);
  }

  await loadPreferences();
  renderFiles();
}

function startDirectoryScan() {
  if (!activeTabId) return;

  scanDirBtn.disabled = true;
  scanDirBtn.textContent = "Scanning...";
  scanStatus.classList.remove("hidden");
  scanStatus.textContent = "Starting scan...";

  let dirCount = 0;
  let scanFinished = false;

  const port = api.tabs.connect(activeTabId, { name: "directoryScan" });

  port.onDisconnect.addListener(() => {
    if (!scanFinished) {
      scanDirBtn.textContent = "Scan Subdirectories";
      scanDirBtn.disabled = false;
      scanStatus.textContent = "Scan interrupted. Try again.";
    }
  });

  port.onMessage.addListener((msg) => {
    if (msg.type === "progress") {
      dirCount++;
      scanStatus.textContent = `Scanning... (${dirCount} directories explored)`;
    } else if (msg.type === "done") {
      scanFinished = true;
      treeData = msg.tree;
      isTreeMode = true;
      const truncatedText = msg.truncated ? " (limit reached)" : "";

      if (treeData) {
        const total = countFiles(treeData);
        badgeEl.textContent = total;
        badgeEl.classList.remove("hidden");
        setBadge(total);
        scanDirBtn.textContent = "Rescan";
        scanDirBtn.disabled = false;
        scanStatus.textContent = `Found ${total} files in ${dirCount + 1} directories${truncatedText}`;
      } else {
        scanDirBtn.textContent = "Scan Subdirectories";
        scanDirBtn.disabled = false;
        scanStatus.textContent = `No files found in subdirectories.${truncatedText}`;
      }

      render(searchEl.value);
      port.disconnect();
    }
  });

  port.postMessage({ action: "scanDirectory" });
}

// --- Event Listeners ---

// Search & sort
let searchTimer = null;
searchEl.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => render(searchEl.value), 120);
});
sortSelect.addEventListener("change", () => render(searchEl.value));

// Directory scan
scanDirBtn.addEventListener("click", startDirectoryScan);

// Select all / deselect all
document.getElementById("selectAll").addEventListener("click", () => {
  fileListEl.querySelectorAll(".file-checkbox").forEach((cb) => {
    const item = cb.closest(".file-item, .tree-file");
    if (item && !item.classList.contains("hidden")) cb.checked = true;
  });
  fileListEl.querySelectorAll(".group-checkbox, .dir-checkbox").forEach((cb) => {
    cb.checked = true;
    cb.indeterminate = false;
  });
  updateDownloadBtn();
});

document.getElementById("deselectAll").addEventListener("click", () => {
  fileListEl.querySelectorAll(".file-checkbox").forEach((cb) => (cb.checked = false));
  fileListEl.querySelectorAll(".group-checkbox, .dir-checkbox").forEach((cb) => {
    cb.checked = false;
    cb.indeterminate = false;
  });
  updateDownloadBtn();
});

// Download
downloadBtn.addEventListener("click", () => {
  const files = getSelectedFiles();
  if (files.length === 0) return;

  const subfolder = subfolderEl.value.trim();
  const payload = files.map((f) => ({
    ...f,
    subfolder: subfolder || undefined
  }));

  if (!downloadPort) connectDownloadPort();
  downloadPort.postMessage({ action: "download", files: payload });

  downloadBtn.disabled = true;
  downloadBtn.textContent = "Downloading...";
  progressContainer.classList.remove("hidden");
  progressBar.style.width = "0%";
  progressText.textContent = "Starting downloads...";
  retryBtn.classList.add("hidden");
});

// Retry failed
retryBtn.addEventListener("click", () => {
  if (!downloadPort) connectDownloadPort();
  downloadPort.postMessage({ action: "retry" });
  retryBtn.classList.add("hidden");
  progressText.textContent = "Retrying failed downloads...";
});

// Copy URLs
copyUrlsBtn.addEventListener("click", () => {
  const files = getSelectedFiles();
  if (files.length === 0) return;

  const urls = files.map((f) => f.url).join("\n");
  navigator.clipboard.writeText(urls).then(() => {
    copyUrlsBtn.textContent = "Copied!";
    setTimeout(() => { copyUrlsBtn.textContent = "Copy URLs"; }, 1500);
  }).catch(() => {
    copyUrlsBtn.textContent = "Copy failed";
    setTimeout(() => { copyUrlsBtn.textContent = "Copy URLs"; }, 2000);
  });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const isMod = e.ctrlKey || e.metaKey;
  const inInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT";

  // Ctrl+A — select all (when not in an input)
  if (isMod && e.key === "a" && !inInput) {
    e.preventDefault();
    document.getElementById("selectAll").click();
  }

  // Ctrl+D — download selected
  if (isMod && e.key === "d") {
    e.preventDefault();
    if (!downloadBtn.disabled) downloadBtn.click();
  }

  // / — focus search
  if (e.key === "/" && !inInput) {
    e.preventDefault();
    searchEl.focus();
  }

  // Escape — clear filter and blur
  if (e.key === "Escape") {
    if (searchEl.value) {
      searchEl.value = "";
      render("");
    }
    document.activeElement?.blur();
  }
});

// --- Init ---
connectDownloadPort();
scanActiveTab();
