// Drives popup/popup.html in a real DOM with the extension APIs stubbed.
// popup.js is otherwise only syntax-checked, so this is its only coverage.

const { createChecker, collectPageErrors, popupUrl } = require("./harness");

const FLAT_FILES = [
  { url: "https://x.test/a.pdf", filename: "annual-report.pdf", type: "pdf", source: "link" },
  { url: "https://x.test/b.iso", filename: "debian.iso", type: "iso", source: "link" },
  { url: "https://x.test/c.csv", filename: "data.csv", type: "csv", source: "link" },
  { url: "https://x.test/d.png", filename: "diagram.png", type: "png", source: "media" },
  { url: "https://x.test/e.woff2", filename: "inter.woff2", type: "woff2", source: "link" }
];

const TREE = {
  name: "files", path: "/files/", type: "dir", url: "https://x.test/files/",
  children: [
    { name: "root.pdf", path: "/files/root.pdf", type: "file", url: "https://x.test/files/root.pdf", ext: "pdf" },
    { name: "sub", path: "/files/sub/", type: "dir", url: "https://x.test/files/sub/", children: [
      { name: "inner.zip", path: "/files/sub/inner.zip", type: "file", url: "https://x.test/files/sub/inner.zip", ext: "zip" }
    ] }
  ]
};

const stub = ({ files, isDirectory }) => `
  window.__dl = [];
  window.__scan = [];
  window.__stored = {};
  const dlPort = {
    postMessage: (m) => window.__dl.push(m), disconnect() {},
    onMessage: { addListener(fn) { window.__pushDl = fn; } },
    onDisconnect: { addListener() {} }
  };
  window.chrome = {
    runtime: { connect: () => dlPort },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async (id, msg) => { window.__scan.push(msg);
        return { files: ${JSON.stringify(files)}, isDirectory: ${isDirectory} }; },
      connect: () => ({
        postMessage: (m) => window.__scan.push(m),
        disconnect: () => { window.__scanDisconnected = true; },
        onMessage: { addListener: (fn) => { window.__pushScan = fn; } },
        onDisconnect: { addListener: (fn) => { window.__scanDisc = fn; } }
      })
    },
    scripting: { executeScript: async () => [] },
    storage: { local: {
      get: async () => window.__stored,
      set: async (o) => { Object.assign(window.__stored, o); }
    } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} }
  };
`;

async function openPopup(browser, options) {
  const page = await browser.newPage();
  const errors = collectPageErrors(page);
  await page.addInitScript(stub(options));
  await page.goto(popupUrl());
  await page.waitForFunction(() => !document.getElementById("loading")
    || document.getElementById("loading").classList.contains("hidden"));
  return { page, errors };
}

module.exports = async function popupTests(playwright) {
  const check = createChecker("popup");
  const browser = await playwright.chromium.launch();

  // --- Flat list: grouping, selection, download ---------------------------
  {
    const { page, errors } = await openPopup(browser, { files: FLAT_FILES, isDirectory: false });
    check("no page errors", errors.length === 0, errors.join(" | "));

    check("scan bar offered even on a non-listing page", await page.isVisible("#scanDirBar"));
    check("scan bar not highlighted when undetected",
      (await page.evaluate(() => document.getElementById("scanDirBar").classList.contains("suggested"))) === false);

    const groups = await page.$$eval(".group-header", (els) => els.map((e) => e.textContent.trim()));
    check("broadened extensions land in real categories",
      !groups.some((g) => g.startsWith("Other")), groups.join(", "));
    check("categories are family-based",
      groups.some((g) => g.startsWith("Archives")) && groups.some((g) => g.startsWith("Fonts")),
      groups.join(", "));

    // Selection must survive the re-render that filtering causes.
    await page.click('.file-checkbox[data-url="https://x.test/b.iso"]');
    await page.click('.file-checkbox[data-url="https://x.test/a.pdf"]');
    check("two files selected", (await page.textContent("#downloadBtn")).includes("(2)"));

    await page.fill("#search", "diagram");
    await page.waitForTimeout(250);
    check("filter hides the selected rows", (await page.$$(".file-item")).length === 1);
    check("selection survives filtering",
      (await page.textContent("#downloadBtn")).includes("(2)"), await page.textContent("#downloadBtn"));

    await page.click("#downloadBtn");
    const payload = await page.evaluate(() => window.__dl.find((m) => m.action === "download"));
    check("download sends every selected file, including filtered-out ones",
      Boolean(payload) && payload.files.length === 2, JSON.stringify(payload && payload.files));

    // Deselect All must clear hidden selections too.
    await page.click("#deselectAll");
    check("deselect all clears hidden selections",
      (await page.textContent("#downloadBtn")) === "Download Selected");

    await page.fill("#search", "");
    await page.waitForTimeout(200);
    await page.click("#includeAllTypes");
    await page.waitForTimeout(300);
    check("all-types toggle re-scans",
      (await page.evaluate(() => window.__scan.filter((m) => m.action === "scanPage").pop()))?.includeAllTypes === true);
    check("all-types choice is persisted",
      (await page.evaluate(() => window.__stored.scanSettings))?.includeAllTypes === true);

    // Progress reporting.
    await page.evaluate(() => window.__pushDl({
      type: "progress", completed: 3, failed: 1, active: 2, queued: 4, retried: 2, total: 10
    }));
    const progress = await page.textContent("#progressText");
    check("progress reports counts", /3\/10 completed/.test(progress), progress);
    check("progress reports retries", /2 retried/.test(progress), progress);
    check("retry button offered when something failed", await page.isVisible("#retryBtn"));

    await page.evaluate(() => window.__pushDl({
      type: "done", completed: 0, total: 4, retried: 1,
      failed: [{ url: "u1", filename: "f1" }, { url: "u2", filename: "f2" },
               { url: "u3", filename: "f3" }, { url: "u4", filename: "f4" }]
    }));
    check("a fully failed batch does not render as complete",
      (await page.evaluate(() => document.getElementById("progressBar").style.width)) === "0%");
    check("auto-retries are surfaced on completion",
      /auto-retried/.test(await page.textContent("#progressText")), await page.textContent("#progressText"));

    await page.close();
  }

  // --- Directory scan: controls, stop, partial results, a11y --------------
  {
    const { page, errors } = await openPopup(browser, { files: FLAT_FILES, isDirectory: true });
    check("no page errors (tree flow)", errors.length === 0, errors.join(" | "));
    check("scan bar highlighted on a detected listing",
      await page.evaluate(() => document.getElementById("scanDirBar").classList.contains("suggested")));
    check("stop button hidden before a scan", !(await page.isVisible("#stopScanBtn")));

    await page.selectOption("#scanDepth", "all");
    await page.selectOption("#scanMaxDirs", "1000");
    await page.click("#scanDirBtn");
    await page.waitForTimeout(150);

    const sent = await page.evaluate(() => window.__scan.find((m) => m.action === "scanDirectory"));
    check("crawl options reach the content script",
      sent && sent.maxDepth === "all" && sent.maxDirs === 1000, JSON.stringify(sent));
    check("crawl options persisted",
      (await page.evaluate(() => window.__stored.scanSettings))?.maxDepth === "all");

    check("stop button shown during a scan", await page.isVisible("#stopScanBtn"));
    check("scan button disabled during a scan", await page.isDisabled("#scanDirBtn"));
    check("scan options locked during a scan",
      (await page.isDisabled("#scanDepth")) && (await page.isDisabled("#scanMaxDirs"))
      && (await page.isDisabled("#includeAllTypes")));

    const beforeSecond = await page.evaluate(() => window.__scan.length);
    await page.evaluate(() => document.getElementById("scanDirBtn").click());
    check("a second scan cannot start underneath the first",
      (await page.evaluate(() => window.__scan.length)) === beforeSecond);

    await page.click("#stopScanBtn");
    await page.waitForTimeout(80);
    check("stop requests cancellation",
      await page.evaluate(() => window.__scan.some((m) => m.action === "cancelScan")));
    check("stop does not tear down the port",
      !(await page.evaluate(() => window.__scanDisconnected === true)));

    await page.evaluate((tree) => window.__pushScan({
      type: "done", tree, truncated: false, cancelled: true, scanned: 3, failedCount: 2,
      failed: [{ url: "https://x.test/files/bad/", reason: "HTTP 500" },
               { url: "https://x.test/files/slow/", reason: "timed out" }]
    }), TREE);
    await page.waitForTimeout(150);

    const status = await page.textContent("#scanStatus");
    check("status reports files and directories", /Found 2 files in 3 directories/.test(status), status);
    check("status reports the early stop", /stopped early/.test(status), status);
    check("status reports unreachable directories", /2 unreachable/.test(status), status);
    check("unreachable directories listed in the tooltip",
      /HTTP 500/.test((await page.getAttribute("#scanStatus", "title")) || ""), "no title");
    check("controls unlocked after a scan",
      !(await page.isDisabled("#scanDirBtn")) && !(await page.isDisabled("#includeAllTypes")));
    check("stop button hidden after a scan", !(await page.isVisible("#stopScanBtn")));
    check("tree rendered", (await page.$$(".tree-file")).length === 2);

    const toggle = await page.$(".tree-toggle");
    check("expand control is a real button", (await toggle.evaluate((e) => e.tagName)) === "BUTTON");
    check("expand control exposes aria-expanded", (await toggle.getAttribute("aria-expanded")) === "true");
    check("directory checkbox has an accessible name",
      Boolean(await page.getAttribute(".dir-checkbox", "aria-label")));

    await toggle.focus();
    check("expand control is focusable",
      await page.evaluate(() => document.activeElement.classList.contains("tree-toggle")));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    check("Enter collapses the directory", (await toggle.getAttribute("aria-expanded")) === "false");
    check("collapsed class applied",
      await page.evaluate(() => document.querySelector(".tree-children").classList.contains("collapsed")));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    check("Enter re-expands the directory", (await toggle.getAttribute("aria-expanded")) === "true");

    await page.click('.file-checkbox[data-url="https://x.test/files/sub/inner.zip"]');
    await page.click("#downloadBtn");
    const treePayload = await page.evaluate(() => window.__dl.find((m) => m.action === "download"));
    check("tree download keeps its relative path",
      treePayload && treePayload.files[0].filename === "sub/inner.zip",
      JSON.stringify(treePayload && treePayload.files));

    await page.close();
  }

  await browser.close();
  return check.results;
};
