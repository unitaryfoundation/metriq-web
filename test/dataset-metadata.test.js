import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDatasetGeneratedDate } from '../dataset-metadata.js';

test('normalizes a generated_at timestamp to a UTC calendar date', () => {
  assert.equal(
    normalizeDatasetGeneratedDate('2026-08-20T14:34:20.551601Z'),
    '2026-08-20',
  );
});

test('uses the UTC date when an offset timestamp crosses a date boundary', () => {
  assert.equal(
    normalizeDatasetGeneratedDate('2026-01-01T23:30:00-02:00'),
    '2026-01-02',
  );
});

test('rejects nullish, non-string, blank, and invalid generated_at values', () => {
  for (const value of [
    null,
    undefined,
    0,
    {},
    '',
    '   ',
    'not-a-timestamp',
    'August 20, 2026',
    '2026-08-20',
    '2026-02-30T00:00:00Z',
  ]) {
    assert.equal(normalizeDatasetGeneratedDate(value), null);
  }
});
