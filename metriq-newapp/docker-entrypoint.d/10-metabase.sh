#!/bin/sh
set -e

APP_ROOT="/usr/share/nginx/html"
cd "$APP_ROOT"

# Generate Metabase embed JSON if secrets are present
if [ -n "$METABASE_SECRET_KEY" ] && [ -n "$METABASE_QUESTION_ID" ]; then
  echo "[entrypoint] generating Metabase embed URL"
  METABASE_SECRET_KEY="$METABASE_SECRET_KEY" \
  METABASE_QUESTION_ID="$METABASE_QUESTION_ID" \
  METABASE_SITE_URL="${METABASE_SITE_URL:-https://metriq.info/meta}" \
  METABASE_BORDERED="${METABASE_BORDERED:-true}" \
  METABASE_TITLED="${METABASE_TITLED:-true}" \
  METABASE_TTL_SECONDS="${METABASE_TTL_SECONDS:-1209600}" \
  node scripts/generate-metabase-embed.js || {
    echo "[entrypoint] failed to generate Metabase embed; continuing with existing file" >&2
  }
else
  echo "[entrypoint] METABASE_SECRET_KEY or METABASE_QUESTION_ID not set; using existing data/metabase-embed.json"
fi

# Ensure nginx can read the embed config
if [ -f "$APP_ROOT/data/metabase-embed.json" ]; then
  chmod 644 "$APP_ROOT/data/metabase-embed.json"
fi

# Determine data URLs, preferring mounted metriq-data when env is unset.
CONFIG_FILE="$APP_ROOT/data/config.json"
if [ -z "$BENCHMARKS_URL" ] && [ -d "$APP_ROOT/metriq-data" ]; then
  BENCHMARKS_URL="/metriq-data/benchmark.latest.json"
fi
if [ -z "$PLATFORMS_INDEX_URL" ] && [ -d "$APP_ROOT/metriq-data/platforms" ]; then
  PLATFORMS_INDEX_URL="/metriq-data/platforms/index.json"
fi

echo "[entrypoint] configuring app data URLs"
echo "  BENCHMARKS_URL=${BENCHMARKS_URL:-<default>}"
echo "  PLATFORMS_INDEX_URL=${PLATFORMS_INDEX_URL:-<default>}"

# Export so the node process can read them
export BENCHMARKS_URL
export PLATFORMS_INDEX_URL

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
