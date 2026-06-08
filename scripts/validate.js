#!/usr/bin/env node

const fs = require("fs");

const REQUIRED_FILES = [
  "background.js",
  "content.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "LICENSE"
];

function readManifest(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const chromeManifest = readManifest("manifest.json");
const firefoxManifest = readManifest("manifest.firefox.json");

assert(chromeManifest.manifest_version === 3, "manifest.json must be MV3");
assert(firefoxManifest.manifest_version === 3, "manifest.firefox.json must be MV3");
assert(chromeManifest.version === firefoxManifest.version, "Manifest versions must match");
assert(chromeManifest.background?.service_worker === "background.js", "Chrome manifest must use background.service_worker");
assert(!chromeManifest.background?.scripts, "Chrome manifest must not include background.scripts");
assert(!chromeManifest.browser_specific_settings, "Chrome manifest must not include Firefox-specific settings");
assert(Array.isArray(firefoxManifest.background?.scripts), "Firefox manifest must use background.scripts");
assert(!firefoxManifest.background?.service_worker, "Firefox manifest must not include background.service_worker");
assert(firefoxManifest.browser_specific_settings?.gecko?.id, "Firefox manifest must include a Gecko extension ID");

for (const file of REQUIRED_FILES) {
  assert(fs.existsSync(file), `Required file is missing: ${file}`);
}

console.log("Manifest and required-file validation passed.");
