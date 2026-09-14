// Shared plumbing for the browser-driven tests.
//
// These tests need a real DOM, so they drive Chromium through Playwright. That
// is the one thing here that is not dependency-free, which is why they run under
// `npm run test:ui` rather than `npm test` — see test/browser/README.md.

const http = require("http");
const path = require("path");

// Playwright is expected to be available globally (or installed locally); it is
// deliberately not a package dependency.
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    "playwright",
    "/opt/node22/lib/node_modules/playwright",
    "/usr/lib/node_modules/playwright",
    "/usr/local/lib/node_modules/playwright"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  return null;
}

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function repoFile(relative) {
  return path.join(REPO_ROOT, relative);
}

function popupUrl() {
  return `file://${repoFile("popup/popup.html")}`;
}

// --- Assertions -------------------------------------------------------------

function createChecker(label) {
  const results = { label, passed: 0, failed: 0, notes: [] };

  const check = (name, condition, detail = "") => {
    if (condition) {
      results.passed += 1;
      console.log(`  PASS  ${name}`);
    } else {
      results.failed += 1;
      console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ""}`);
    }
  };

  check.note = (text) => {
    results.notes.push(text);
    console.log(`  ..    ${text}`);
  };
  check.results = results;
  return check;
}

// --- Directory server -------------------------------------------------------

// Serves a generated Apache-style index for a nested plain-object tree, so the
// crawler is exercised against real HTTP rather than a stubbed fetch.
//
//   { "a.pdf": "body", sub: { "b.iso": "body" } }
//
// `delay` adds latency per request (for measuring concurrency) and
// `brokenPrefixes` makes matching paths fail (for unreachable-directory paths).
function startDirectoryServer({ tree, delay = 0, brokenPrefixes = [], root = "/files" } = {}) {
  const resolve = (segments) => {
    let node = tree;
    for (const segment of segments) {
      if (!node || typeof node !== "object") return undefined;
      node = node[segment];
    }
    return node;
  };

  const renderIndex = (urlPath, node) => {
    const entries = Object.keys(node).sort().map((name) => {
      const isDir = node[name] && typeof node[name] === "object";
      const href = isDir ? `${encodeURIComponent(name)}/` : encodeURIComponent(name);
      return `<a href="${href}">${href}</a>`;
    });
    return `<!doctype html><html><head><title>Index of ${urlPath}</title></head>`
      + `<body><pre><a href="../">../</a>\n${entries.join("\n")}</pre></body></html>`;
  };

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    const send = () => {
      if (brokenPrefixes.some((prefix) => urlPath.startsWith(prefix))) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("deliberate failure");
        return;
      }
      if (!urlPath.startsWith(root)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return;
      }

      const relative = urlPath.slice(root.length).replace(/^\/+/, "");
      let segments = relative.split("/").filter(Boolean);

      // Real servers serve the directory index at both "/dir/" and
      // "/dir/index.html", so the crawler must cope with either as a root.
      let servesIndexPage = false;
      if (segments[segments.length - 1] === "index.html") {
        const parent = resolve(segments.slice(0, -1));
        if (parent && typeof parent === "object") {
          segments = segments.slice(0, -1);
          servesIndexPage = true;
        }
      }

      const node = resolve(segments);
      if (servesIndexPage) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderIndex(urlPath, node));
        return;
      }

      if (node && typeof node === "object") {
        if (!urlPath.endsWith("/")) {
          res.writeHead(301, { Location: `${urlPath}/` });
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderIndex(urlPath, node));
        return;
      }
      if (typeof node === "string") {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end(node);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    };

    if (delay > 0) setTimeout(send, delay);
    else send();
  });

  return new Promise((resolve_) => {
    // Port 0 lets the OS pick, so parallel or repeated runs cannot collide.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve_({
        port,
        origin: `http://127.0.0.1:${port}`,
        rootUrl: `http://127.0.0.1:${port}${root}/`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

// --- Page setup -------------------------------------------------------------

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

module.exports = {
  loadPlaywright,
  createChecker,
  startDirectoryServer,
  collectPageErrors,
  popupUrl,
  repoFile,
  REPO_ROOT
};
