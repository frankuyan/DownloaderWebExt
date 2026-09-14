// isDirectoryListing() across real-world index layouts, and ordinary pages that
// must not be mistaken for one.

const fs = require("fs");
const { createChecker, createChecker: _c, repoFile } = require("./harness");

const CONTENT_SCRIPT = fs.readFileSync(repoFile("content.js"), "utf8");
const CHROME_STUB = `window.chrome = { runtime: {
  onMessage: { addListener() {} }, onConnect: { addListener() {} } } };`;

const CASES = [
  ["Apache autoindex", true, `<title>Index of /files</title><pre>
    <a href="../">../</a><a href="a.pdf">a.pdf</a><a href="sub/">sub/</a></pre>`],

  ["nginx autoindex", true, `<title>Index of /files/</title><pre>
    <a href="../">../</a><a href="b.zip">b.zip</a><a href="docs/">docs/</a></pre>`],

  ["Python http.server", true, `<title>Directory listing for /files/</title><ul>
    <li><a href="a.pdf">a.pdf</a></li><li><a href="sub/">sub/</a></li>
    <li><a href="c.txt">c.txt</a></li></ul>`],

  ["Caddy-style div rows, no Index-of title", true, `<title>files</title><div>
    <div><a href="../">..</a></div><div><a href="report.pdf">report.pdf</a></div>
    <div><a href="images/">images/</a></div><div><a href="notes.txt">notes.txt</a></div></div>`],

  ["h5ai-style list, no parent link", true, `<title>Browse</title><ul>
    <li><a href="alpha/">alpha/</a></li><li><a href="beta/">beta/</a></li>
    <li><a href="gamma/">gamma/</a></li><li><a href="readme.txt">readme.txt</a></li></ul>`],

  ["table listing without Index-of title", true, `<title>Downloads</title><table>
    <tr><td><a href="../">../</a></td></tr><tr><td><a href="x.iso">x.iso</a></td></tr>
    <tr><td><a href="old/">old/</a></td></tr></table>`],

  ["ordinary marketing page", false, `<title>Acme</title><nav>
    <a href="/">Home</a><a href="/about">About</a><a href="/pricing">Pricing</a>
    <a href="https://example.net/acme">Social</a><a href="/contact">Contact</a></nav>
    <p><a href="https://example.com/x">external</a></p>`],

  ["blog post with body links", false, `<title>My post</title><article>
    <a href="/">home</a><a href="/tags/js">js</a><a href="https://example.net/a">ref</a>
    <a href="https://example.net/b">ref2</a><a href="/archive">archive</a></article>`],

  ["page with too few links", false, `<title>Tiny</title>
    <a href="a/">a/</a><a href="../">..</a>`]
];

module.exports = async function detectionTests(playwright) {
  const check = createChecker("detection");
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();

  let body = "";
  await page.route("**/files/**", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: `<!doctype html><html><body>${body}</body></html>`
  }));

  for (const [name, expected, html] of CASES) {
    body = html;
    await page.goto("http://listing.test/files/");
    await page.addScriptTag({ content: CHROME_STUB });
    await page.addScriptTag({ content: CONTENT_SCRIPT });
    const got = await page.evaluate(() => isDirectoryListing());
    check(`${name} -> ${expected}`, got === expected, `got ${got}`);
  }

  await browser.close();
  return check.results;
};
