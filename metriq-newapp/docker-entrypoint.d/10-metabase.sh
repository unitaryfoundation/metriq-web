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

# Write config.json if BENCHMARKS_URL provided
CONFIG_FILE="$APP_ROOT/data/config.json"
if [ -n "$BENCHMARKS_URL" ]; then
  echo "[entrypoint] writing benchmarks config for $BENCHMARKS_URL"
  node <<'NODE' "$CONFIG_FILE"
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.argv[2]);
let config = {};
try {
  config = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {}
if (typeof config !== 'object' || config === null) config = {};
config.benchmarksUrl = process.env.BENCHMARKS_URL;
fs.writeFileSync(file, JSON.stringify(config, null, 2));
NODE
  chmod 644 "$CONFIG_FILE"
elif [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'EOF'
{
  "benchmarksUrl": "./data/benchmarks.json",
  "benchmarkPages": []
}
EOF
  chmod 644 "$CONFIG_FILE"
fi
