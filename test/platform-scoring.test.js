import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetriqScore, calculateOverlapScores } from '../platform-scoring.js';

const component = (raw, baseline, extra = {}) => ({
  weight: 0.5, group: 'Mirror circuits', group_weight: 1, sub_weight: 0.5,
  aggregation: 'arithmetic', raw, baseline, direction: 'higher',
  normalized: raw === null || baseline === null || baseline <= 0 ? null : 100 * raw / baseline,
  ...extra,
});
const mirror = () => ({ small: component(0.8, 0.8), large: component(0.1, 0.01) });
const missing = (value) => ({ ...value, raw: null, normalized: null });
const close = (actual, expected) => assert.ok(
  actual !== null && Math.abs(actual - expected) < 1e-9,
  `Expected ${actual} to equal ${expected}`,
);

test('arithmetic groups aggregate raw values before normalizing, including at full overlap', () => {
  const left = mirror();
  const right = { small: component(0.4, 0.8), large: component(0.02, 0.01) };
  const score = calculateMetriqScore(left);
  close(score, 111.11111111111111);
  assert.notEqual(score, 550);
  const overlap = calculateOverlapScores(left, right);
  close(overlap.left, score);
  close(overlap.right, calculateMetriqScore(right));
  assert.deepEqual(overlap.sharedNames, ['large', 'small']);
});

test('a measurement missing on either device is excluded for both, with original coverage weights', () => {
  const full = mirror();
  const smallOnly = { ...mirror(), large: missing(full.large) };
  const largeOnly = { ...mirror(), small: missing(full.small) };
  close(calculateOverlapScores(full, smallOnly).left, 50);
  close(calculateOverlapScores(full, smallOnly).right, 50);
  close(calculateOverlapScores(full, largeOnly).left, 500);
  close(calculateOverlapScores(full, largeOnly).right, 500);
});

test('harmonic groups apply missing coverage without inserting a literal zero', () => {
  const harmonic = (value) => component(null, null, { aggregation: 'harmonic', normalized: value });
  const full = { first: harmonic(100), second: harmonic(200) };
  const partial = { first: harmonic(100), second: harmonic(null) };
  close(calculateMetriqScore(full), 400 / 3);
  assert.deepEqual(calculateOverlapScores(full, partial), {
    left: 50, right: 50, sharedNames: ['first'],
  });
  const zero = { first: harmonic(100), second: harmonic(0) };
  assert.deepEqual(calculateOverlapScores(full, zero), {
    left: 400 / 3, right: 0, sharedNames: ['first', 'second'],
  });
});

test('a zero raw result is an available measurement, unlike a missing result', () => {
  const left = mirror();
  const right = { small: component(0, 0.8), large: component(0.1, 0.01) };
  const overlap = calculateOverlapScores(left, right);
  assert.deepEqual(overlap.sharedNames, ['large', 'small']);
  close(overlap.right, 100 * 0.1 / 0.81);
  close(overlap.left, calculateMetriqScore(left));
});

test('a zero baseline is usable in a raw aggregate even without a normalized component score', () => {
  const left = { small: component(0.8, 0.8), large: component(0.1, 0) };
  const right = { small: component(0.4, 0.8), large: component(0.2, 0) };
  const overlap = calculateOverlapScores(left, right);
  assert.deepEqual(overlap.sharedNames, ['large', 'small']);
  close(overlap.left, 112.5);
  close(overlap.right, 75);
});

test('lower-is-better groups invert the aggregate and keep missing coverage', () => {
  const left = {
    small: component(2, 4, { direction: 'lower', normalized: 200 }),
    large: component(8, 4, { direction: 'lower', normalized: 50 }),
  };
  close(calculateMetriqScore(left), 80);
  const right = { ...left, large: missing(left.large) };
  close(calculateOverlapScores(left, right).left, 100);
  close(calculateOverlapScores(left, right).right, 100);
});

test('derived normalized-only arithmetic groups retain weighted fallback and full denominator', () => {
  const left = {
    first: component(null, null, { normalized: 80 }),
    second: component(null, null, { normalized: 20 }),
  };
  const right = { ...left, second: missing(left.second) };
  close(calculateMetriqScore(left), 50);
  assert.deepEqual(calculateOverlapScores(left, right), {
    left: 40, right: 40, sharedNames: ['first'],
  });
});

test('raw and normalized-only inputs are not silently mixed across devices', () => {
  const left = mirror();
  const right = {
    small: component(null, null, { normalized: 100 }),
    large: component(null, null, { normalized: 1000 }),
  };
  assert.deepEqual(calculateOverlapScores(left, right), { left: 0, right: 0, sharedNames: [] });
});

test('the two devices retain their own group and component weights', () => {
  const left = {
    shared: component(null, null, { group: null, normalized: 100, weight: 1 }),
    other: component(null, null, { group: null, normalized: 100, weight: 3 }),
  };
  const right = {
    shared: component(null, null, { group: null, normalized: 100, weight: 3 }),
    other: component(null, null, { group: null, normalized: null, weight: 1 }),
  };
  assert.deepEqual(calculateOverlapScores(left, right), {
    left: 25, right: 75, sharedNames: ['shared'],
  });
});

test('raw benchmark contributions keep each device’s suite-level weight', () => {
  const withGroupWeight = (weight, otherNormalized) => ({
    small: component(0.8, 0.8, { group_weight: weight, weight: weight / 2 }),
    large: component(0.1, 0.01, { group_weight: weight, weight: weight / 2 }),
    other: component(null, null, { group: null, weight: 1 - weight, normalized: otherNormalized }),
  });
  const overlap = calculateOverlapScores(withGroupWeight(0.25, 100), withGroupWeight(0.75, null));
  close(overlap.left, 111.11111111111111 * 0.25);
  close(overlap.right, 111.11111111111111 * 0.75);
  assert.deepEqual(overlap.sharedNames, ['large', 'small']);
});

test('unsupported, absent, and non-finite measurements contribute zero for both devices', () => {
  const left = mirror();
  for (const raw of [null, undefined, NaN, Infinity, '']) {
    const right = {
      small: component(raw, 0.8, { normalized: null, outcome: 'unsupported' }),
      large: component(raw, 0.01, { normalized: null }),
    };
    assert.deepEqual(calculateOverlapScores(left, right), { left: 0, right: 0, sharedNames: [] });
  }
  const disjoint = { different: component(1, 1, { weight: 1, sub_weight: 1 }) };
  assert.deepEqual(calculateOverlapScores(left, disjoint), { left: 0, right: 0, sharedNames: [] });
});

test('older payloads without required raw baseline metadata are unavailable', () => {
  const old = mirror();
  delete old.small.baseline;
  assert.equal(calculateMetriqScore(old), null);
  assert.deepEqual(calculateOverlapScores(old, mirror()), { left: null, right: null, sharedNames: [] });
  const noDirection = mirror();
  delete noDirection.small.direction;
  assert.equal(calculateMetriqScore(noDirection), null);
  assert.equal(calculateMetriqScore({}), null);
  assert.equal(calculateMetriqScore({ first: { weight: 0, normalized: 100 } }), null);
});

test('baseline device values use the supplied self-anchored baseline', () => {
  const baseline = {
    small: component(0.8, 0.8, { baseline_is_self: true }),
    large: component(0.01, 0.01, { baseline_is_self: true }),
  };
  close(calculateMetriqScore(baseline), 100);
  close(calculateOverlapScores(baseline, mirror()).left, 100);
});

test('swapping devices swaps scores and input payloads are never modified', () => {
  const left = mirror();
  const right = { ...mirror(), large: missing(left.large) };
  const before = structuredClone([left, right]);
  const forward = calculateOverlapScores(left, right);
  const backward = calculateOverlapScores(right, left);
  assert.deepEqual(forward, {
    left: backward.right, right: backward.left, sharedNames: backward.sharedNames,
  });
  assert.deepEqual([left, right], before);
});
