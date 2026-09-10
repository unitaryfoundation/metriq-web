import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustMetriqScoreForRecords } from '../platform-records.js';
import { calculateMetriqScore, calculateOverlapScores } from '../platform-scoring.js';

const latest = '2026-09-01T00:00:00Z';
const older = '2026-08-01T00:00:00Z';
const largeTimestamp = '2026-09-01T00:01:00Z';

function component(overrides = {}) {
  return {
    group: 'Mirror Circuits', metric: 'score', aggregation: 'arithmetic',
    weight: 0.5, group_weight: 1, sub_weight: 0.5,
    normalized: 100, normalized_available: true, normalized_timestamp: latest,
    timestamp: latest, raw: 0.8, raw_available: true, raw_timestamp: latest,
    baseline: 0.8, direction: 'higher', baseline_is_self: false,
    group_subscore: 111.11111111111111,
    ...overrides,
  };
}

function detail(overrides = {}) {
  const components = {
    small: component(),
    large: component({ raw: 0.1, baseline: 0.01, normalized: 1000,
      timestamp: largeTimestamp, normalized_timestamp: largeTimestamp, raw_timestamp: largeTimestamp }),
    ...overrides,
  };
  return { provider: 'ibm', device: 'device', metriq_score: {
    value: calculateMetriqScore(components), components,
  } };
}

function run(overrides = {}) {
  return {
    timestamp: latest, normalizedScores: { score: 100 }, rawResults: { score: 0.8 },
    normalizationBaselines: { score: 0.8 }, rawDirections: { score: 'higher' },
    ...overrides,
  };
}

function index(entries) {
  return new Map([['ibm::device::Mirror Circuits', entries]]);
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `Expected ${actual} to be approximately ${expected}`);

test('all-time arithmetic score aggregates the selected raw records before normalization', () => {
  const original = detail();
  const before = structuredClone(original);
  const runs = index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: { score: 1.6 } }) },
    { sig: 'large', run: run({ timestamp: largeTimestamp, normalizedScores: { score: 1000 }, rawResults: { score: 0.1 }, normalizationBaselines: { score: 0.01 } }) },
  ]);
  const adjusted = adjustMetriqScoreForRecords(original, runs);
  close(adjusted.metriq_score.value, 100 * (1.6 + 0.1) / (0.8 + 0.01));
  const small = adjusted.metriq_score.components.small;
  assert.equal(small.normalized, 200);
  assert.equal(small.raw, 1.6);
  assert.equal(small.baseline, 0.8);
  assert.equal(small.raw_timestamp, older);
  assert.equal(small.normalized_timestamp, older);
  assert.equal('group_subscore' in small, false);
  assert.deepEqual(original, before, 'the published detail is not mutated');
  const overlap = calculateOverlapScores(adjusted.metriq_score.components, original.metriq_score.components);
  close(overlap.left, adjusted.metriq_score.value);
  close(overlap.right, original.metriq_score.value);
});

test('raw value, normalization baseline, and direction come from the same winning run', () => {
  const original = detail({ large: component({ raw: null, raw_available: false, baseline: null, normalized: null,
    timestamp: null, normalized_timestamp: null, raw_timestamp: null }) });
  const adjusted = adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 300 }, rawResults: { score: 0.2 }, normalizationBaselines: { score: 0.6 }, rawDirections: { score: 'lower' } }) },
  ]));
  const selected = adjusted.metriq_score.components.small;
  assert.equal(selected.raw, 0.2);
  assert.equal(selected.baseline, 0.6);
  assert.equal(selected.direction, 'lower');
  close(adjusted.metriq_score.value, 150);
});

test('an arithmetic improvement without its baseline is not mixed with the latest baseline', () => {
  const original = detail();
  const adjusted = adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: { score: 1.6 }, normalizationBaselines: {} }) },
  ]));
  assert.strictEqual(adjusted, original);
});

test('the raw timestamp identifies the scored instance when normalized and raw records differ', () => {
  const original = detail({ small: component({ normalized_timestamp: '2026-08-31T00:00:00Z' }) });
  const adjusted = adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'other-width', run: run({ timestamp: '2026-08-31T00:00:00Z' }) },
    { sig: 'other-width', run: run({ timestamp: '2026-07-01T00:00:00Z', normalizedScores: { score: 10000 }, rawResults: { score: 80 } }) },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: { score: 1.6 } }) },
  ]));
  assert.equal(adjusted.metriq_score.components.small.normalized, 200);
  assert.equal(adjusted.metriq_score.components.small.raw, 1.6);
});

test('an ambiguous timestamp cannot replace a component with a different instance', () => {
  const original = detail();
  assert.strictEqual(adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'large', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: { score: 1.6 } }) },
  ])), original);
});

test('derived normalized-only groups can select best records without raw values', () => {
  const components = { derived: component({ weight: 1, sub_weight: 1, normalized: 80, raw: null, raw_available: false, raw_timestamp: null, baseline: null }) };
  const original = { provider: 'ibm', device: 'device', metriq_score: { value: 80, components } };
  const adjusted = adjustMetriqScoreForRecords(original, index([
    { sig: 'derived', run: run({ normalizedScores: { score: 80 }, rawResults: {} }) },
    { sig: 'derived', run: run({ timestamp: older, normalizedScores: { score: 120 }, rawResults: {}, normalizationBaselines: {} }) },
  ]));
  assert.equal(adjusted.metriq_score.value, 120);
  assert.equal(adjusted.metriq_score.components.derived.raw, null);
  assert.equal(adjusted.metriq_score.components.derived.raw_timestamp, null);
});

test('baseline devices remain anchored to 100 when an older raw result improves', () => {
  const original = detail({
    small: component({ baseline_is_self: true }),
    large: component({ raw: 0.1, baseline: 0.1, normalized: 100, baseline_is_self: true,
      timestamp: largeTimestamp, normalized_timestamp: largeTimestamp, raw_timestamp: largeTimestamp }),
  });
  const adjusted = adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: { score: 1.6 } }) },
  ]));
  assert.equal(adjusted.metriq_score.value, 100);
  assert.equal(adjusted.metriq_score.components.small.normalized, 100);
  assert.equal(adjusted.metriq_score.components.small.raw, 1.6);
  assert.equal(adjusted.metriq_score.components.small.baseline, 1.6);
});

test('a zero baseline raw result does not acquire a nonexistent normalized score', () => {
  const original = detail({
    small: component({ direction: 'lower', baseline_is_self: true }),
    large: component({ raw: 0.1, baseline: 0.1, normalized: 100, baseline_is_self: true,
      timestamp: largeTimestamp, normalized_timestamp: largeTimestamp, raw_timestamp: largeTimestamp }),
  });
  const adjusted = adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: {}, rawResults: { score: 0 }, rawDirections: { score: 'lower' } }) },
  ]));
  assert.equal(adjusted.metriq_score.value, 100);
  assert.equal(adjusted.metriq_score.components.small.normalized, null);
  assert.equal(adjusted.metriq_score.components.small.normalized_available, false);
  assert.equal(adjusted.metriq_score.components.small.normalized_timestamp, null);
  assert.equal(adjusted.metriq_score.components.small.raw_timestamp, older);
});

test('derived-only baseline scores ignore old normalized ratios above 100', () => {
  const components = { derived: component({ weight: 1, sub_weight: 1, normalized: 100, raw: null, raw_available: false, raw_timestamp: null, baseline: null, baseline_is_self: true }) };
  const original = { provider: 'ibm', device: 'device', metriq_score: { value: 100, components } };
  assert.strictEqual(adjustMetriqScoreForRecords(original, index([
    { sig: 'derived', run: run({ normalizedScores: { score: 100 }, rawResults: {} }) },
    { sig: 'derived', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: {} }) },
  ])), original);
});

test('old arithmetic payloads without normalization inputs keep their published score', () => {
  const original = detail();
  delete original.metriq_score.components.small.baseline;
  const before = structuredClone(original);
  assert.strictEqual(adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 }, rawResults: { score: 1.6 } }) },
  ])), original);
  assert.deepEqual(original, before);
});

test('missing or malformed data and unmatched anchors leave details unchanged', () => {
  for (const original of [null, {}, { metriq_score: {} }, { metriq_score: { components: [] } }, detail()]) {
    assert.strictEqual(adjustMetriqScoreForRecords(original, new Map()), original);
  }
  const original = detail();
  assert.strictEqual(adjustMetriqScoreForRecords(original, null), original);
  assert.strictEqual(adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: 200 } }) },
  ])), original);
  assert.strictEqual(adjustMetriqScoreForRecords(original, index([
    { sig: 'small', run: run() },
    { sig: 'small', run: run({ timestamp: older, normalizedScores: { score: NaN } }) },
  ])), original);
});
