// Exercises the directory crawler in content.js against a real HTTP server.

const fs = require("fs");
const { createChecker, startDirectoryServer, collectPageErrors, repoFile } = require("./harness");

const CONTENT_SCRIPT = fs.readFileSync(repoFile("content.js"), "utf8");

// Minimal chrome shim: capture the onConnect listener so the test can drive the
// real message handler the popup would talk to.
const CHROME_STUB = `
  window.__fromContent = [];
  window.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      onConnect: { addListener(fn) { window.__onConnect = fn; } }
    }
  };
  window.__connect = () => {
    window.__fromContent = [];
    window.__onConnect({
      name: "directoryScan",
      postMessage: (m) => window.__fromContent.push(m),
      disconnect() { window.__portDisconnected = true; },
      onDisconnect: { addListener: (fn) => { window.__disc = fn; } },
      onMessage: { addListener: (fn) => { window.__toContent = fn; } }
    });
  };
`;

const SMALL_TREE = {
  "report.pdf": "pdf",
  sub1: { "disk.iso": "iso", deep: { "rows.csv": "csv" } },
  sub2: { "chart.png": "png", "firmware.bin": "bin", "notes.html": "<html></html>" }
};

const WIDE_TREE = (() => {
  const tree = { broken: {} };
  for (let i = 0; i < 12; i += 1) {
    tree[`d${i}`] = { [`a${i}.pdf`]: "pdf", [`b${i}.zip`]: "zip" };
  }
  return tree;
})();

function countFiles(node) {
  let total = 0;
  (function walk(current) {
    for (const child of current.children) {
      if (child.type === "file") total += 1;
      else walk(child);
    }
  })(node);
  return total;
}

function flatten(node, prefix = "") {
  const out = [];
  for (const child of node.children) {
    if (child.type === "file") out.push(prefix + child.name);
    else out.push(...flatten(child, `${prefix}${child.name}/`));
  }
  return out.sort();
}

async function preparePage(browser, rootUrl) {
  const page = await browser.newPage();
  const errors = collectPageErrors(page);
  await page.addInitScript(CHROME_STUB);
  await page.goto(rootUrl);
  await page.addScriptTag({ content: CONTENT_SCRIPT });
  return { page, errors };
}

function runScan(page, message) {
  return page.evaluate(async (msg) => {
    window.__connect();
    const started = performance.now();
    window.__toContent(msg);
    while (!window.__fromContent.some((m) => m.type === "done")) {
      await new Promise((r) => setTimeout(r, 20));
      if (performance.now() - started > 30000) throw new Error("scan timed out");
    }
    return {
      done: window.__fromContent.find((m) => m.type === "done"),
      ms: performance.now() - started
    };
  }, message);
}

module.exports = async function crawlTests(playwright) {
  const check = createChecker("crawl");
  const browser = await playwright.chromium.launch();

  // --- Traversal, limits and type filtering -------------------------------
  {
    const server = await startDirectoryServer({ tree: SMALL_TREE });
    const { page, errors } = await preparePage(browser, server.rootUrl);
    check("no page errors", errors.length === 0, errors.join(" | "));

    const full = await runScan(page, { action: "scanDirectory", maxDepth: 10, maxDirs: 200 });
    check("walks the whole tree", full.done.scanned === 4, `scanned ${full.done.scanned}`);
    check("lists files from every level",
      flatten(full.done.tree).join(",") === "report.pdf,sub1/deep/rows.csv,sub1/disk.iso,sub2/chart.png",
      flatten(full.done.tree).join(","));
    check("broadened types are collected (.iso, .csv)",
      flatten(full.done.tree).some((f) => f.endsWith(".iso")) &&
      flatten(full.done.tree).some((f) => f.endsWith(".csv")));
    check("unlisted .bin skipped by default",
      !flatten(full.done.tree).some((f) => f.endsWith(".bin")));

    const shallow = await runScan(page, { action: "scanDirectory", maxDepth: 1, maxDirs: 200 });
    check("depth limit stops the descent",
      !flatten(shallow.done.tree).some((f) => f.includes("deep/")) &&
      flatten(shallow.done.tree).includes("sub1/disk.iso"),
      flatten(shallow.done.tree).join(","));

    const all = await runScan(page, { action: "scanDirectory", maxDepth: 10, maxDirs: 200, includeAllTypes: true });
    check("all-types mode collects .bin",
      flatten(all.done.tree).some((f) => f.endsWith(".bin")), flatten(all.done.tree).join(","));
    check("all-types mode still skips .html pages",
      !flatten(all.done.tree).some((f) => f.endsWith(".html")), flatten(all.done.tree).join(","));

    check("listing is detected on a generated index", await page.evaluate(() => isDirectoryListing()));

    await page.close();
    await server.close();
  }

  // --- Concurrency, caps, cancellation, failures ---------------------------
  {
    const server = await startDirectoryServer({ tree: WIDE_TREE, delay: 80, brokenPrefixes: ["/files/broken"] });
    const { page } = await preparePage(browser, server.rootUrl);

    const serial = await runScan(page, { action: "scanDirectory", maxDepth: 5, maxDirs: 200, concurrency: 1 });
    const pooled = await runScan(page, { action: "scanDirectory", maxDepth: 5, maxDirs: 200 });

    check("pooled and serial crawls agree on contents",
      countFiles(serial.done.tree) === 24 && countFiles(pooled.done.tree) === 24,
      `serial=${countFiles(serial.done.tree)} pooled=${countFiles(pooled.done.tree)}`);
    check("pooled crawl is substantially faster",
      pooled.ms < serial.ms * 0.6,
      `serial=${Math.round(serial.ms)}ms pooled=${Math.round(pooled.ms)}ms`);
    check.note(`serial ${Math.round(serial.ms)}ms vs pooled ${Math.round(pooled.ms)}ms `
      + `(${(serial.ms / pooled.ms).toFixed(1)}x)`);

    const order = (result) => result.done.tree.children
      .filter((c) => c.type === "dir").map((c) => c.name).join(",");
    check("tree order does not depend on which fetch wins",
      order(serial) === order(pooled), `${order(serial)} vs ${order(pooled)}`);

    check("unreachable directory is reported", pooled.done.failedCount === 1, JSON.stringify(pooled.done.failed));
    check("failure carries a reason",
      Boolean(pooled.done.failed[0]) && /500/.test(pooled.done.failed[0].reason),
      JSON.stringify(pooled.done.failed));

    const capped = await runScan(page, { action: "scanDirectory", maxDepth: 5, maxDirs: 4 });
    check("directory cap is exact under concurrency", capped.done.scanned === 4, `scanned ${capped.done.scanned}`);
    check("truncation is flagged", capped.done.truncated === true);

    const cancelled = await page.evaluate(async () => {
      window.__connect();
      window.__toContent({ action: "scanDirectory", maxDepth: 5, maxDirs: 200 });
      await new Promise((r) => setTimeout(r, 250));
      window.__toContent({ action: "cancelScan" });
      const started = performance.now();
      while (!window.__fromContent.some((m) => m.type === "done")) {
        await new Promise((r) => setTimeout(r, 20));
        if (performance.now() - started > 15000) throw new Error("cancel timed out");
      }
      return window.__fromContent.find((m) => m.type === "done");
    });
    check("a stopped scan still delivers its tree", Boolean(cancelled.tree));
    check("a stopped scan is flagged as cancelled", cancelled.cancelled === true);
    check("a stopped scan returns partial results",
      cancelled.scanned > 0 && cancelled.scanned < 14, `scanned ${cancelled.scanned}`);

    await page.close();
    await server.close();
  }

  await browser.close();
  return check.results;
};
