const api = typeof browser !== "undefined" ? browser : chrome;

const CATEGORIES = {
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"],
  Images: ["png", "jpg", "gif", "svg"],
  Media: ["mp3", "mp4"],
  Archives: ["zip", "rar"]
};

const TYPE_ICONS = {
  pdf: "\u{1F4C4}", doc: "\u{1F4DD}", docx: "\u{1F4DD}", xls: "\u{1F4CA}", xlsx: "\u{1F4CA}",
  ppt: "\u{1F4CA}", pptx: "\u{1F4CA}", png: "\u{1F5BC}", jpg: "\u{1F5BC}", gif: "\u{1F5BC}",
  svg: "\u{1F5BC}", mp3: "\u{1F3B5}", mp4: "\u{1F3AC}", zip: "\u{1F4E6}", rar: "\u{1F4E6}"
};

let allFiles = [];
let treeData = null;
let isTreeMode = false;

const fileListEl = document.getElementById("fileList");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const badgeEl = document.getElementById("badge");
const searchEl = document.getElementById("search");
const downloadBtn = document.getElementById("downloadBtn");
const scanDirBar = document.getElementById("scanDirBar");
const scanDirBtn = document.getElementById("scanDirBtn");
const scanStatus = document.getElementById("scanStatus");

function getCategoryForType(type) {
  for (const [cat, types] of Object.entries(CATEGORIES)) {
    if (types.includes(type)) return cat;
  }
  return "Other";
}

function getSelectedUrls() {
  const checked = fileListEl.querySelectorAll(".file-checkbox:checked");
  return Array.from(checked).map((cb) => cb.dataset.url);
}

function updateDownloadBtn() {
  const count = getSelectedUrls().length;
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

  const categoryOrder = ["Documents", "Images", "Media", "Archives", "Other"];
  let anyVisible = false;

  for (const cat of categoryOrder) {
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
    header.appendChild(groupCb);
    header.appendChild(document.createTextNode(`${cat} (${files.length})`));
    section.appendChild(header);

    for (const file of files) {
      const item = document.createElement("label");
      item.className = "file-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "file-checkbox";
      cb.dataset.url = file.url;
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

      item.append(cb, icon, name, ext);
      section.appendChild(item);
    }

    groupCb.addEventListener("change", () => {
      const checkboxes = section.querySelectorAll(".file-checkbox");
      checkboxes.forEach((cb) => (cb.checked = groupCb.checked));
      updateDownloadBtn();
    });

    fileListEl.appendChild(section);
  }

  emptyEl.classList.toggle("hidden", anyVisible);
}

// --- Tree View ---

function countFiles(node) {
  if (node.type === "file") return 1;
  let count = 0;
  for (const child of node.children) {
    count += countFiles(child);
  }
  return count;
}

function nodeMatchesFilter(node, filter) {
  if (node.type === "file") {
    return node.name.toLowerCase().includes(filter);
  }
  return node.children.some((child) => nodeMatchesFilter(child, filter));
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

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "file-checkbox";
    cb.dataset.url = node.url;
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

  // Sort: directories first, then files
  const dirs = node.children.filter((c) => c.type === "dir");
  const files = node.children.filter((c) => c.type === "file");

  for (const child of [...dirs, ...files]) {
    const childEl = renderTreeNode(child, depth + 1, filter);
    if (childEl) childrenContainer.appendChild(childEl);
  }

  // Don't render empty directories when filtering
  if (filter && childrenContainer.children.length === 0) return null;

  container.appendChild(childrenContainer);

  // Toggle expand/collapse
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isCollapsed = childrenContainer.classList.toggle("collapsed");
    toggle.classList.toggle("collapsed", isCollapsed);
    dirIcon.textContent = isCollapsed ? "\u{1F4C1}" : "\u{1F4C2}";
  });

  // Directory checkbox toggles all descendant files
  dirCb.addEventListener("change", () => {
    const fileCheckboxes = childrenContainer.querySelectorAll(".file-checkbox");
    fileCheckboxes.forEach((cb) => (cb.checked = dirCb.checked));
    // Also update child dir checkboxes
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
}

function render(filter) {
  if (isTreeMode && treeData) {
    renderTree(filter);
  } else {
    renderFiles(filter);
  }
}

// --- Scan workflow ---

let activeTabId = null;

async function scanActiveTab() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab.id;

    await api.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const response = await api.tabs.sendMessage(tab.id, { action: "scanPage" });
    allFiles = response?.files || response || [];

    // Handle both old format (array) and new format ({files, isDirectory})
    const isDirectory = response?.isDirectory || false;

    if (isDirectory) {
      scanDirBar.classList.remove("hidden");
    }
  } catch {
    allFiles = [];
  }

  loadingEl.classList.add("hidden");

  if (allFiles.length > 0) {
    badgeEl.textContent = allFiles.length;
    badgeEl.classList.remove("hidden");
  }

  renderFiles();
}

function startDirectoryScan() {
  if (!activeTabId) return;

  scanDirBtn.disabled = true;
  scanDirBtn.textContent = "Scanning...";
  scanStatus.classList.remove("hidden");
  scanStatus.textContent = "Starting scan...";

  let fileCount = 0;
  let dirCount = 0;

  const port = api.tabs.connect(activeTabId, { name: "directoryScan" });

  port.onDisconnect.addListener(() => {
    if (scanDirBtn.disabled) {
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
      treeData = msg.tree;
      isTreeMode = true;

      if (treeData) {
        const total = countFiles(treeData);
        badgeEl.textContent = total;
        badgeEl.classList.remove("hidden");
        scanDirBtn.textContent = "Rescan";
        scanDirBtn.disabled = false;
        scanStatus.textContent = `Found ${total} files in ${dirCount + 1} directories`;
      } else {
        scanDirBtn.textContent = "Scan Subdirectories";
        scanDirBtn.disabled = false;
        scanStatus.textContent = "No files found in subdirectories.";
      }

      render(searchEl.value);
      port.disconnect();
    }
  });

  port.postMessage({ action: "scanDirectory" });
}

// Event listeners
searchEl.addEventListener("input", () => render(searchEl.value));

scanDirBtn.addEventListener("click", startDirectoryScan);

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

downloadBtn.addEventListener("click", () => {
  const urls = getSelectedUrls();
  if (urls.length === 0) return;

  api.runtime.sendMessage({ action: "download", urls }, (result) => {
    if (result) {
      downloadBtn.textContent = `Done! (${result.completed} downloaded)`;
      setTimeout(() => updateDownloadBtn(), 2000);
    }
  });
});

scanActiveTab();
