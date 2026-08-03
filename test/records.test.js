// Regression tests for duplicate-record aggregation (issue #26).
// Runs against the compiled records.js: `npm test` builds first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRunsForDisplay, isProviderHidden, recordInstanceSig, variantParamSummaries, withoutHiddenProviders } from '../records.js';

const getScore = (run) => {
  const v = run?.metrics?.score;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const makeRun = (overrides = {}) => ({
  provider: 'aws',
  device: 'ionq_forte-1',
  benchmark: 'Linear Ramp QAOA',
  timestamp: '2026-07-10T15:14:15Z',
  metrics: { score: 50 },
  rawParams: { benchmark_name: 'Linear Ramp QAOA', num_qubits: 10, shots: 1000 },
  ...overrides,
});

test('runs differing by num_qubits are all displayed (issue #26)', () => {
  const q10 = makeRun({ metrics: { score: 55.75 }, rawParams: { benchmark_name: 'Linear Ramp QAOA', num_qubits: 10, shots: 1000 } });
  const q20 = makeRun({
    timestamp: '2026-07-10T15:14:26Z',
    metrics: { score: 84.44 },
    rawParams: { benchmark_name: 'Linear Ramp QAOA', num_qubits: 20, shots: 1000 },
  });
  for (const mode of ['all-time', 'latest']) {
    const kept = dedupeRunsForDisplay([q10, q20], mode, getScore);
    assert.equal(kept.length, 2, `${mode} mode must keep both qubit-count variants`);
    assert.ok(kept.includes(q10) && kept.includes(q20));
  }
});

test('true duplicates (same instance, different sampling effort) still collapse', () => {
  const older = makeRun({ timestamp: '2026-07-01T00:00:00Z', metrics: { score: 80 }, rawParams: { num_qubits: 10, shots: 500, seed: 1 } });
  const newer = makeRun({ timestamp: '2026-07-10T00:00:00Z', metrics: { score: 60 }, rawParams: { num_qubits: 10, shots: 1000, seed: 2 } });

  const allTime = dedupeRunsForDisplay([older, newer], 'all-time', getScore);
  assert.deepEqual(allTime, [older], 'all-time keeps the best-scoring record');

  const latest = dedupeRunsForDisplay([older, newer], 'latest', getScore);
  assert.deepEqual(latest, [newer], 'latest keeps the most recent record');
});

test('latest mode prefers a scored record over a newer scoreless one', () => {
  const scored = makeRun({ timestamp: '2026-07-01T00:00:00Z', metrics: { score: 70 } });
  const scoreless = makeRun({ timestamp: '2026-07-10T00:00:00Z', metrics: {} });
  const kept = dedupeRunsForDisplay([scored, scoreless], 'latest', getScore);
  assert.deepEqual(kept, [scored]);
});

test('runs without rawParams collapse per device/benchmark as before', () => {
  const a = makeRun({ timestamp: '2026-07-01T00:00:00Z', metrics: { score: 90 }, rawParams: undefined });
  const b = makeRun({ timestamp: '2026-07-10T00:00:00Z', metrics: { score: 40 }, rawParams: undefined });
  const kept = dedupeRunsForDisplay([a, b], 'all-time', getScore);
  assert.deepEqual(kept, [a]);
});

test('recordInstanceSig ignores key order and sampling-effort params', () => {
  const sigA = recordInstanceSig({ num_qubits: 10, graph: 'ring', shots: 100, seed: 7 });
  const sigB = recordInstanceSig({ seed: 99, graph: 'ring', shots: 5000, num_qubits: 10 });
  assert.equal(sigA, sigB);
  assert.notEqual(sigA, recordInstanceSig({ num_qubits: 20, graph: 'ring' }));
});

test('variantParamSummaries labels only params that vary and skips excluded ones', () => {
  const shallow = makeRun({ benchmark: 'Mirror Circuits', rawParams: { benchmark_name: 'Mirror Circuits', width: 30, num_layers: 4, shots: 100 } });
  const deep = makeRun({ benchmark: 'Mirror Circuits', rawParams: { benchmark_name: 'Mirror Circuits', width: 30, num_layers: 16, shots: 200 } });
  const lonely = makeRun({ device: 'other_device' });
  const summaries = variantParamSummaries([shallow, deep, lonely], ['benchmark_name', 'num_qubits', 'max_qubits', 'width']);
  assert.equal(summaries.get(shallow), 'num_layers=4');
  assert.equal(summaries.get(deep), 'num_layers=16');
  assert.equal(summaries.get(lonely), '', 'runs with no siblings get no badge');
});

test('qubit-count-only variants get no badge (Qubits column covers them)', () => {
  const q10 = makeRun({ rawParams: { benchmark_name: 'Linear Ramp QAOA', num_qubits: 10 } });
  const q20 = makeRun({ rawParams: { benchmark_name: 'Linear Ramp QAOA', num_qubits: 20 } });
  const summaries = variantParamSummaries([q10, q20], ['benchmark_name', 'num_qubits', 'max_qubits', 'width']);
  assert.equal(summaries.get(q10), '');
  assert.equal(summaries.get(q20), '');
});

test('hidden providers are omitted case-insensitively without mutating source data', () => {
  const rows = [
    makeRun({ provider: 'ibm', device: 'ibm_fez' }),
    makeRun({ provider: 'LOCAL', device: 'ibm_fez' }),
  ];
  const visible = withoutHiddenProviders(rows, { hiddenProviders: [' local '] });
  assert.deepEqual(visible, [rows[0]]);
  assert.equal(rows.length, 2, 'source data remains unchanged');
});

test('provider visibility is configurable', () => {
  assert.equal(isProviderHidden('local', { hiddenProviders: ['local'] }), true);
  assert.equal(isProviderHidden('local', {}), true, 'local stays hidden if production config fails to load');
  assert.equal(isProviderHidden('local', { hiddenProviders: [] }), false);
  assert.equal(isProviderHidden('ibm', { hiddenProviders: ['local'] }), false);
});
