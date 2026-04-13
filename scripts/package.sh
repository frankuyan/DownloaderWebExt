#!/usr/bin/env bash
# Build a zip for Chrome Web Store / Firefox AMO submission.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./manifest.json').version)" 2>/dev/null \
  || grep -o '"version": *"[^"]*"' manifest.json | head -1 | cut -d'"' -f4)

OUT_DIR="dist"
OUT_FILE="${OUT_DIR}/file-downloader-${VERSION}.zip"

mkdir -p "${OUT_DIR}"
rm -f "${OUT_FILE}"

zip -r "${OUT_FILE}" \
  manifest.json \
  background.js \
  content.js \
  popup/ \
  icons/ \
  LICENSE \
  -x "*.DS_Store" "*/.DS_Store" >/dev/null

echo "Wrote ${OUT_FILE}"
ls -lh "${OUT_FILE}"
