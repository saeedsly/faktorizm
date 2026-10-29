#!/usr/bin/env bash
# Prepare an offline Windows wheel set for the Faktorizm OCR service.
#
# Usage:  bash scripts/fetch-python-wheels.sh [PY_VERSION]
#         bash scripts/fetch-python-wheels.sh 3.11   (default)
#
# Output: ocr-service/wheels/  (git-ignored; copy it into the Windows package
#         next to requirements-lock.txt, then setup.bat installs with --no-index)
set -euo pipefail

PY_VERSION="${1:-3.11}"
PY_TAG="cp$(echo "$PY_VERSION" | tr -d '.')"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/ocr-service/wheels"

mkdir -p "$OUT"
echo "[wheels] downloading Windows x86_64 wheels for Python $PY_VERSION ..."

python3 -m pip download \
  --dest "$OUT" \
  --only-binary=:all: \
  --platform win_amd64 \
  --platform any \
  --python-version "$(echo "$PY_VERSION" | tr -d '.')" \
  --implementation cp \
  --abi "$PY_TAG" \
  --abi none \
  -r "$ROOT/ocr-service/requirements-lock.txt"

echo "[wheels] done -> $OUT"
ls -lh "$OUT" | tail -n +2
