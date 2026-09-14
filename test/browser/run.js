#!/usr/bin/env node
// Runs the browser-driven suites. Kept out of `npm test` because it needs
// Playwright, which is deliberately not a package dependency.

const { loadPlaywright } = require("./harness");

const SUITES = [
  ["popup", require("./popup.test.js")],
  ["detection", require("./detection.test.js")],
  ["crawl", require("./crawl.test.js")]
];

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    console.error("Playwright is not available.\n");
    console.error("These tests drive a real browser, so they are optional and not part");
    console.error("of `npm test`. To run them:\n");
    console.error("  npm install -g playwright && npx playwright install chromium");
    console.error("  npm run test:ui\n");
    console.error("Set PLAYWRIGHT_PATH to point at an existing install instead.");
    process.exit(2);
  }

  const only = process.argv[2];
  const selected = only ? SUITES.filter(([name]) => name === only) : SUITES;
  if (selected.length === 0) {
    console.error(`Unknown suite: ${only}. Available: ${SUITES.map(([n]) => n).join(", ")}`);
    process.exit(2);
  }

  let passed = 0;
  let failed = 0;

  for (const [name, suite] of selected) {
    console.log(`\n${name}`);
    try {
      const results = await suite(playwright);
      passed += results.passed;
      failed += results.failed;
    } catch (err) {
      failed += 1;
      console.log(`  FAIL  suite threw: ${err && err.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
