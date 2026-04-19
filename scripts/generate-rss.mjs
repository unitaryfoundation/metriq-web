import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Feed } from 'feed';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const updatesPath = path.join(rootDir, 'data', 'updates.json');
const outputPath = path.join(rootDir, 'feed.xml');
const siteUrl = String(process.env.METRIQ_SITE_URL ?? 'https://metriq.info').trim().replace(/\/+$/, '') || 'https://metriq.info';
const faviconUrl = `${siteUrl}/public/favicon.ico`;
const INVALID_DATE_FALLBACK_TIME = 0;
const asText = (value) => String(value ?? '').trim();
const asDate = (value) => {
  const text = asText(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : new Date(text);
  if (Number.isNaN(Number(date))) {
    console.warn(`Invalid update date "${text || '<empty>'}" in ${updatesPath}; using Unix epoch fallback.`);
    return new Date(INVALID_DATE_FALLBACK_TIME);
  }
  return date;
};

const parsed = JSON.parse(readFileSync(updatesPath, 'utf8'));
if (!Array.isArray(parsed)) {
  throw new Error('data/updates.json must contain a JSON array');
}

const updates = parsed
  .map((item) => ({
    id: asText(item?.id),
    date: asText(item?.date),
    title: asText(item?.title),
    body: asText(item?.body),
    href: asText(item?.href),
    linkText: asText(item?.linkText),
  }))
  .filter((item) => item.id && (item.title || item.body))
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

const feed = new Feed({
  title: 'Metriq Updates',
  description: 'Latest news and product updates from Metriq.',
  id: `${siteUrl}/`,
  link: `${siteUrl}/`,
  language: 'en-us',
  image: faviconUrl,
  favicon: faviconUrl,
  updated: updates[0] ? asDate(updates[0].date) : new Date(),
  feedLinks: { rss2: `${siteUrl}/feed.xml` },
});

for (const update of updates) {
  const itemUrl = `${siteUrl}/#update=${encodeURIComponent(update.id)}`;
  feed.addItem({
    title: update.title || update.body || 'Metriq update',
    id: itemUrl,
    link: itemUrl,
    description: [update.body, update.href ? `${update.linkText || 'More'}: ${update.href}` : ''].filter(Boolean).join('\n\n'),
    date: asDate(update.date),
  });
}

writeFileSync(outputPath, feed.rss2(), 'utf8');
console.log(`Generated ${outputPath} with ${updates.length} item(s).`);
