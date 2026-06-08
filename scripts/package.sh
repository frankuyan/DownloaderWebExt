#!/usr/bin/env bash
# Build a zip for Chrome Web Store / Firefox AMO submission.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./manifest.json').version)" 2>/dev/null \
  || grep -o '"version": *"[^"]*"' manifest.json | head -1 | cut -d'"' -f4)

ROOT_DIR=$(pwd)
OUT_DIR="${ROOT_DIR}/dist"
CHROME_OUT="${OUT_DIR}/file-downloader-chrome-${VERSION}.zip"
FIREFOX_OUT="${OUT_DIR}/file-downloader-firefox-${VERSION}.zip"
COMMON_FILES=(background.js content.js popup/ icons/ LICENSE)

mkdir -p "${OUT_DIR}"
rm -f "${CHROME_OUT}" "${FIREFOX_OUT}"

zip -r "${CHROME_OUT}" \
  manifest.json \
  "${COMMON_FILES[@]}" \
  -x "*.DS_Store" "*/.DS_Store" >/dev/null

TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

cp manifest.firefox.json "${TMP_DIR}/manifest.json"
cp background.js content.js LICENSE "${TMP_DIR}/"
cp -R popup icons "${TMP_DIR}/"

(
  cd "${TMP_DIR}"
  zip -r "${FIREFOX_OUT}" \
    manifest.json \
    background.js \
    content.js \
    popup/ \
    icons/ \
    LICENSE \
    -x "*.DS_Store" "*/.DS_Store" >/dev/null
)

echo "Wrote:"
ls -lh "${CHROME_OUT}" "${FIREFOX_OUT}"
