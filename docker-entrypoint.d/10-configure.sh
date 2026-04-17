#!/bin/sh
set -e

APP_ROOT="/usr/share/nginx/html"
cd "$APP_ROOT"

# Determine data URLs, preferring mounted metriq-data when env is unset.
CONFIG_FILE="$APP_ROOT/data/config.json"
if [ -z "$BENCHMARKS_URL" ] && [ -d "$APP_ROOT/metriq-data" ]; then
  BENCHMARKS_URL="/metriq-data/benchmark.latest.json"
fi
if [ -z "$PLATFORMS_INDEX_URL" ] && [ -d "$APP_ROOT/metriq-data/platforms" ]; then
  PLATFORMS_INDEX_URL="/metriq-data/platforms/index.json"
fi
if [ -z "$METRIQ_SITE_URL" ]; then
  METRIQ_SITE_URL="http://localhost:8080"
fi

echo "[entrypoint] configuring app data URLs"
echo "  BENCHMARKS_URL=${BENCHMARKS_URL:-<default>}"
echo "  PLATFORMS_INDEX_URL=${PLATFORMS_INDEX_URL:-<default>}"
echo "  METRIQ_SITE_URL=${METRIQ_SITE_URL}"

# Export so the node process can read them
export BENCHMARKS_URL
export PLATFORMS_INDEX_URL
export METRIQ_SITE_URL

# Merge env overrides into data/config.json
node - "$CONFIG_FILE" <<'NODE'
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.argv[2]);
let config = {};
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
if (typeof config !== 'object' || config === null) config = {};
const b = process.env.BENCHMARKS_URL;
const p = process.env.PLATFORMS_INDEX_URL;
if (b) config.benchmarksUrl = b;
if (p) config.platformsIndexUrl = p;
fs.writeFileSync(file, JSON.stringify(config, null, 2));
NODE

chmod 644 "$CONFIG_FILE"

# Regenerate the RSS feed at container start so local runs can use a localhost URL
# while production builds keep the canonical default.
if [ -f "$APP_ROOT/scripts/generate-rss.mjs" ]; then
  echo "[entrypoint] regenerating RSS feed"
  node "$APP_ROOT/scripts/generate-rss.mjs"
  chmod 644 "$APP_ROOT/feed.xml"
fi
