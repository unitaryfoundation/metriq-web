#!/usr/bin/env node
/**
 * Generate a signed Metabase embed URL and write it to data/metabase-embed.json.
 *
 * Usage:
 *   METABASE_SECRET_KEY=... METABASE_QUESTION_ID=52 node scripts/generate-metabase-embed.js
 *
 * Optional env vars:
 *   METABASE_SITE_URL (defaults to https://metriq.info/meta)
 *   METABASE_BORDERED (true/false)
 *   METABASE_TITLED (true/false)
 *   METABASE_TTL_SECONDS (defaults to 1209600 — 14 days)
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const DEFAULT_SITE_URL = 'https://metriq.info/meta';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

const METABASE_SECRET_KEY = process.env.METABASE_SECRET_KEY;
const QUESTION_ID = Number(process.env.METABASE_QUESTION_ID);
const METABASE_SITE_URL = (process.env.METABASE_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
const METABASE_BORDERED = String(process.env.METABASE_BORDERED || 'false').toLowerCase() === 'true';
const METABASE_TITLED = String(process.env.METABASE_TITLED || 'false').toLowerCase() === 'true';
const METABASE_TTL_SECONDS = Number(process.env.METABASE_TTL_SECONDS);

if (!METABASE_SECRET_KEY) {
  console.error('METABASE_SECRET_KEY is required');
  process.exit(1);
}

if (!Number.isFinite(QUESTION_ID)) {
  console.error('METABASE_QUESTION_ID must be a number');
  process.exit(1);
}

const ttlSeconds = Number.isFinite(METABASE_TTL_SECONDS) && METABASE_TTL_SECONDS > 0
  ? Math.floor(METABASE_TTL_SECONDS)
  : DEFAULT_TTL_SECONDS;

const payload = {
  resource: { question: QUESTION_ID },
  params: {},
  exp: Math.round(Date.now() / 1000) + ttlSeconds,
};

const token = jwt.sign(payload, METABASE_SECRET_KEY);

const hash = `#bordered=${METABASE_BORDERED}&titled=${METABASE_TITLED}`;
const iframeUrl = `${METABASE_SITE_URL}/embed/question/${token}${hash}`;

const outputPath = path.resolve(__dirname, '..', 'data', 'metabase-embed.json');
fs.writeFileSync(outputPath, JSON.stringify({ iframeUrl }, null, 2));
console.log(`Metabase embed URL written to ${outputPath}`);
console.log(`TTL: ${ttlSeconds} seconds (~${(ttlSeconds / 3600).toFixed(1)} hours)`);
