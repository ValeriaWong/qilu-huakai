#!/bin/sh
# Run every test suite + the omen seed stats from the repo root.
# Usage: sh tests/run-all.sh   (from anywhere; it cds to the repo root)
# Each suite exits 1 on any failure, so the script stops at the first
# failing suite (set -e). Per-suite counts are printed by the suites.
set -e
cd "$(dirname "$0")/.."
for f in tests/test-*.js; do
  echo "=== $f ==="
  node "$f"
done
echo "=== tests/omen-seed-stats.js ==="
node tests/omen-seed-stats.js
echo "ALL SUITES PASS"
