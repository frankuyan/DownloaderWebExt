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

// `a` is a deep chain while b/c/d are shallow siblings, so a scan capped at
// three directories reaches different places depending on traversal order.
const DEEP_WIDE_TREE = {
  a: { "a.pdf": "x", aa: { "aa.pdf": "x", aaa: { "aaa.pdf": "x" } } },
  b: { "b.pdf": "x" },
  c: { "c.pdf": "x" },
  d: { "d.pdf": "x" }
};

function findNode(node, name) {
  if (node.name === name) return node;
  for (const child of node.children || []) {
    if (child.type !== "dir") continue;
    const hit = findNode(child, name);
    if (hit) return hit;
  }
  return null;
}

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

    // Cancel once the crawl has demonstrably started, rather than after a fixed
    // delay — a wall-clock delay races the crawl's own speed and made this
    // assertion flaky when the traversal got faster.
    const cancelled = await page.evaluate(async () => {
      window.__connect();
      window.__toContent({ action: "scanDirectory", maxDepth: 5, maxDirs: 200 });

      const started = performance.now();
      const progressCount = () => window.__fromContent.filter((m) => m.type === "progress").length;
      while (progressCount() < 3 && !window.__fromContent.some((m) => m.type === "done")) {
        await new Promise((r) => setTimeout(r, 10));
        if (performance.now() - started > 15000) throw new Error("scan never started");
      }
      window.__toContent({ action: "cancelScan" });

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

  // --- Breadth-first order, and resuming a capped scan ---------------------
  {
    const server = await startDirectoryServer({ tree: DEEP_WIDE_TREE });
    const { page } = await preparePage(browser, server.rootUrl);

    const capped = await runScan(page, { action: "scanDirectory", maxDepth: 10, maxDirs: 3 });
    check("capped scan stops at the cap", capped.done.scanned === 3, `scanned ${capped.done.scanned}`);
    check("capped scan reports work left over",
      capped.done.remaining > 0, `remaining ${capped.done.remaining}`);

    // Breadth-first: the shallow sibling is reached before the deep chain.
    const b = findNode(capped.done.tree, "b");
    const aa = findNode(capped.done.tree, "aa");
    check("breadth-first reaches a shallow sibling before descending",
      Boolean(b) && b.pending !== true, b ? `b.pending=${b.pending}` : "b missing");
    check("breadth-first leaves the deep branch for later",
      Boolean(aa) && aa.pending === true, aa ? `aa.pending=${aa.pending}` : "aa missing");

    // Unreached directories are represented, not silently dropped.
    check("unreached directories appear as pending nodes",
      ["c", "d"].every((name) => findNode(capped.done.tree, name)?.pending === true));

    // Continuing must make progress even though Max dirs was not raised.
    const more = await runScan(page, { action: "continueScan", maxDepth: 10, maxDirs: 3 });
    check("continue is recognised as a resume", more.done.resumed === true);
    check("continue makes progress without raising the cap",
      more.done.scannedNow > 0, `scannedNow ${more.done.scannedNow}`);
    check("continue does not rescan what was already visited",
      more.done.scanned === 3 + more.done.scannedNow,
      `scanned ${more.done.scanned} scannedNow ${more.done.scannedNow}`);

    // Keep continuing until the frontier empties.
    let last = more.done;
    for (let i = 0; i < 6 && last.remaining > 0; i += 1) {
      last = (await runScan(page, { action: "continueScan", maxDepth: 10, maxDirs: 3 })).done;
    }
    check("continuing eventually exhausts the frontier", last.remaining === 0, `remaining ${last.remaining}`);

    // The resumed tree must match what a single uninterrupted scan produces.
    const oneShot = await runScan(page, { action: "scanDirectory", maxDepth: 10, maxDirs: 200 });
    check("resumed tree matches a single full scan",
      flatten(last.tree).join(",") === flatten(oneShot.done.tree).join(","),
      `resumed=[${flatten(last.tree).join(",")}] full=[${flatten(oneShot.done.tree).join(",")}]`);
    check("resumed scan has no duplicate entries",
      new Set(flatten(last.tree)).size === flatten(last.tree).length,
      flatten(last.tree).join(","));
    check("full scan leaves nothing pending", oneShot.done.remaining === 0);

    // A different type filter cannot be merged into an existing crawl.
    const capped2 = await runScan(page, { action: "scanDirectory", maxDepth: 10, maxDirs: 2 });
    check("second capped scan has work left", capped2.done.remaining > 0);
    const switched = await runScan(page, {
      action: "continueScan", maxDepth: 10, maxDirs: 3, includeAllTypes: true
    });
    check("changing the type filter restarts instead of merging",
      switched.done.resumed === false, `resumed=${switched.done.resumed}`);

    await page.close();
    await server.close();
  }

  // --- Root URLs that name the index page, and JS-rendered listings --------
  {
    const server = await startDirectoryServer({ tree: SMALL_TREE });

    // Servers often link the index page explicitly; the crawl must still
    // resolve links against the containing directory.
    const page = await browser.newPage();
    const errors = collectPageErrors(page);
    await page.addInitScript(CHROME_STUB);
    await page.goto(`${server.origin}/files/index.html`);
    await page.addScriptTag({ content: CONTENT_SCRIPT });

    const viaIndex = await runScan(page, { action: "scanDirectory", maxDepth: 10, maxDirs: 200 });
    check("no page errors (index.html root)", errors.length === 0, errors.join(" | "));
    check("a root URL naming the index page still finds files",
      flatten(viaIndex.done.tree).includes("report.pdf"), flatten(viaIndex.done.tree).join(","));
    check("a root URL naming the index page still descends",
      flatten(viaIndex.done.tree).includes("sub1/disk.iso"), flatten(viaIndex.done.tree).join(","));
    check("root node is named after its directory, not the index file",
      viaIndex.done.tree.name === "files", viaIndex.done.tree.name);

    await page.close();
    await server.close();
  }

  {
    // The root page builds its listing in JavaScript; subdirectories serve
    // empty HTML that only fills in on load.
    const page = await browser.newPage();
    const errors = collectPageErrors(page);
    await page.addInitScript(CHROME_STUB);
    await page.route("**/files/**", (route) => {
      const isRoot = new URL(route.request().url()).pathname === "/files/";
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: isRoot
          ? `<!doctype html><html><head><title>Files</title></head><body><div id="list"></div>
             <script>
               const rows = ["built.pdf", "lazy/"];
               document.getElementById("list").innerHTML =
                 rows.map((r) => '<a href="' + r + '">' + r + '</a>').join("");
             </script></body></html>`
          : `<!doctype html><html><body><div id="list"></div></body></html>`
      });
    });
    await page.goto("http://js-index.test/files/");
    await page.addScriptTag({ content: CONTENT_SCRIPT });

    const scanned = await runScan(page, { action: "scanDirectory", maxDepth: 5, maxDirs: 50 });
    check("no page errors (JS index)", errors.length === 0, errors.join(" | "));
    check("client-side rendered root listing is read from the live DOM",
      flatten(scanned.done.tree).includes("built.pdf"), flatten(scanned.done.tree).join(","));
    check("a JS-only subdirectory is reported rather than shown as empty",
      scanned.done.failedCount === 1 && /JavaScript/.test(scanned.done.failed[0].reason),
      JSON.stringify(scanned.done.failed));

    await page.close();
  }

  await browser.close();
  return check.results;
};
