#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node scripts/validate.js
node --check background.js
node --check content.js
node --check popup/popup.js
node --check scripts/validate.js
node --check scripts/smoke-tests.js
bash -n scripts/package.sh
bash -n scripts/validate.sh
node scripts/smoke-tests.js
