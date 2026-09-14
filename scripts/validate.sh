#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/validate.js
node --check background.js
node --check content.js
node --check popup/popup.js
node --check scripts/validate.js
node --check scripts/smoke-tests.js
node --check test/browser/harness.js
node --check test/browser/run.js
node --check test/browser/popup.test.js
node --check test/browser/detection.test.js
node --check test/browser/crawl.test.js
bash -n scripts/package.sh
bash -n scripts/validate.sh
node scripts/smoke-tests.js
