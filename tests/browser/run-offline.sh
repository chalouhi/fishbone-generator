#!/bin/sh
# Runs the browser tests in the official Playwright container with no network
# at all (docker --network none). Usage: tests/browser/run-offline.sh <playwright node_modules> [shots dir]
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
MODS=$1; SHOTS=${2:-}
exec docker run --rm --network none --ipc=host \
  -v "$REPO":/repo:ro -v "$MODS":/pw/node_modules:ro ${SHOTS:+-v "$SHOTS":/shots} \
  -e NODE_PATH=/pw/node_modules ${SHOTS:+-e SHOTS=/shots} -w /repo \
  mcr.microsoft.com/playwright:v1.49.1-noble node --test tests/browser/page.test.js
