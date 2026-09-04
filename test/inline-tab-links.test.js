import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('platform caption links inline tab references to their views', () => {
  assert.match(indexHtml, /<a href="#view=results">Results<\/a>/);
  assert.match(indexHtml, /<a href="#view=benchmarks">Documentation<\/a>/);
});
