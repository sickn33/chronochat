#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="packages"
ZIP_PATH="$PACKAGE_DIR/chronochat-extension.zip"

cd "$ROOT_DIR"

mkdir -p "$PACKAGE_DIR"
rm -f "$ZIP_PATH"

zip -rq "$ZIP_PATH" \
  manifest.json \
  content_script.js \
  service_worker.js \
  style.css \
  assets/icons

echo "Created package: $ZIP_PATH"
