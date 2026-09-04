import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindCaptionLinks, syncCaptionRecordMode } from '../caption-links.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('platform caption links inline tab references to their views', () => {
  assert.match(indexHtml, /<a href="#view=results">Results<\/a>/);
  assert.match(indexHtml, /<a href="#view=benchmarks">Documentation<\/a>/);
  assert.doesNotMatch(indexHtml, /&laquo;<a href="#view=(?:results|benchmarks)">/);
  assert.doesNotMatch(indexHtml, /<\/a>&raquo;/);
});

test('results caption links Graph and Table to their subtabs', () => {
  assert.match(indexHtml, /<a href="#view=results&amp;results_tab=graph">Graph<\/a>/);
  assert.match(indexHtml, /<a href="#view=results&amp;results_tab=table">Table<\/a>/);
});

// Use native EventTarget and URL behavior without requiring a browser for the
// link event and serialization tests. Full panel routing is checked in-browser.
class CaptionLink extends EventTarget {
  constructor(hash) {
    super();
    this.url = new URL(hash, 'https://metriq.info/');
  }

  get hash() { return this.url.hash; }
  set hash(value) { this.url.hash = value; }
}

function click(link, modifiers = {}) {
  const event = new Event('click', { cancelable: true });
  Object.assign(event, { button: 0, ...modifiers });
  link.dispatchEvent(event);
  return event;
}

const captionHashes = [
  '#view=results',
  '#view=benchmarks',
  '#view=results&results_tab=graph',
  '#view=results&results_tab=table',
];

test('caption URLs preserve Latest records for navigation, copying, and new tabs', () => {
  const links = captionHashes.map((hash) => new CaptionLink(hash));
  const destinations = [];
  bindCaptionLinks(links, (hash) => destinations.push(hash));
  syncCaptionRecordMode(links, 'latest');

  links.forEach((link, index) => {
    assert.equal(link.hash, `${captionHashes[index]}&records=latest`);
    const route = new URLSearchParams(new URL(link.url.href).hash.slice(1));
    assert.equal(route.get('records'), 'latest');
    assert.equal(click(link).defaultPrevented, true);
  });
  assert.deepEqual(destinations, links.map((link) => link.hash));

  syncCaptionRecordMode(links, 'all-time');
  assert.deepEqual(links.map((link) => link.hash), captionHashes);
  links.forEach((link) => click(link));
  assert.deepEqual(destinations.slice(4), captionHashes);
});

for (const tab of ['graph', 'table']) {
  test(`every inline ${tab} activation requests routing even when its hash is unchanged`, () => {
    const hash = `#view=results&results_tab=${tab}`;
    const link = new CaptionLink(hash);
    const destinations = [];
    bindCaptionLinks([link], (destination) => destinations.push(destination));

    assert.equal(click(link).defaultPrevented, true);
    assert.equal(click(link).defaultPrevented, true);
    assert.deepEqual(destinations, [hash, hash]);
  });
}

test('caption navigation leaves modified and non-primary clicks to the browser', () => {
  const link = new CaptionLink('#view=results&results_tab=graph');
  const destinations = [];
  bindCaptionLinks([link], (hash) => destinations.push(hash));
  syncCaptionRecordMode([link], 'latest');

  for (const modifiers of [
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
    { button: 1 }, { button: 2 },
  ]) {
    assert.equal(click(link, modifiers).defaultPrevented, false);
  }
  assert.deepEqual(destinations, []);
  assert.equal(link.hash, '#view=results&results_tab=graph&records=latest');
});
