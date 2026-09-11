import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetriqGymDispatchInstructions,
  classifyPlatformScoreComponent,
  comparePlatformScoreValues,
  isSameMetriqGymSuiteRelease,
  mergePlatformScoreComponents,
  resolveMetriqGymSuiteMetadata,
  resolveMetriqGymSuiteDispatch,
  sortPlatformScoreComponents,
  summarizePlatformCoverage,
} from '../platform-components.js';

// Fields every classification carries when nothing was reported.
const noOutcome = { reportedOutcome: null, reportedOutcomeReason: null, reportedOutcomeTimestamp: null };

const entry = (name, group, weight, normalized = 1) => [name, { group, weight, normalized }];

test('platform score components stay grouped regardless of weight', () => {
  const components = [
    entry('EPLG-100', 'EPLG', 0.01),
    entry('QMLK-10:accuracy_score', 'QML Kernel', 0.04),
    entry('EPLG-20', 'EPLG', 0.08),
    entry('EPLG-50', 'EPLG', 0.02, null),
  ];
  const originalOrder = components.slice();

  assert.deepEqual(
    sortPlatformScoreComponents(components).map(([name]) => name),
    [
      'EPLG-20',
      'EPLG-50',
      'EPLG-100',
      'QMLK-10:accuracy_score',
    ],
  );
  assert.deepEqual(components, originalOrder, 'sorting must not mutate the payload entries');
});

test('platform score component sorting uses the parent group, then natural label order', () => {
  const components = [
    entry('Short label 100', 'Linear Ramp QAOA', 0.1),
    entry('Unrelated display label', 'EPLG', 0.1),
    entry('Short label 20', 'Linear Ramp QAOA', 0.1),
    entry('EPLG-10', 'EPLG', 0.1),
  ];

  assert.deepEqual(
    sortPlatformScoreComponents(components).map(([name]) => name),
    [
      'EPLG-10',
      'Unrelated display label',
      'Short label 20',
      'Short label 100',
    ],
  );
});

test('platform score component sorting falls back to the label for missing groups', () => {
  const components = [
    entry('Component 100', '', 0.9),
    entry('Component 20', undefined, 0.1),
  ];

  assert.deepEqual(
    sortPlatformScoreComponents(components).map(([name]) => name),
    ['Component 20', 'Component 100'],
  );
});

test('merges component sets before applying the platform detail order', () => {
  const first = {
    'QMLK-10:accuracy_score': { weight: 0.04 },
    'EPLG-100': { group: 'EPLG', weight: 0.01 },
  };
  const second = {
    'QMLK-10:accuracy_score': { group: 'QML Kernel', weight: 0.04 },
    'EPLG-20': { group: 'EPLG', weight: 0.08 },
  };

  const merged = mergePlatformScoreComponents([first, second]);
  assert.deepEqual(
    merged.map(([name]) => name),
    ['EPLG-20', 'EPLG-100', 'QMLK-10:accuracy_score'],
  );
  assert.equal(
    merged.at(-1)[1],
    second['QMLK-10:accuracy_score'],
    'a component with grouping metadata should be used as the sort representative',
  );
});

test('classifies submitted platform score components from values or timestamps', () => {
  for (const component of [
    { normalized_available: true },
    { raw_available: true },
    { normalized: 0 },
    { raw: '0.25' },
    { timestamp: '2026-09-03T00:00:00Z' },
    { normalized_timestamp: '2026-09-03T00:00:00Z' },
    { raw_timestamp: '2026-09-03T00:00:00Z' },
  ]) {
    assert.deepEqual(
      classifyPlatformScoreComponent(component, 5),
      { status: 'submitted', hasResult: true, requiredNumQubits: null, ...noOutcome },
    );
  }
});

test('distinguishes unsupported components from missing submissions', () => {
  assert.deepEqual(
    classifyPlatformScoreComponent({ required_num_qubits: '20' }, 10),
    { status: 'unsupported', hasResult: false, requiredNumQubits: 20, ...noOutcome },
  );
  assert.deepEqual(
    classifyPlatformScoreComponent({ required_num_qubits: 10 }, 10),
    { status: 'missing', hasResult: false, requiredNumQubits: 10, ...noOutcome },
  );
  assert.deepEqual(
    classifyPlatformScoreComponent({ required_num_qubits: 20 }, null),
    { status: 'missing', hasResult: false, requiredNumQubits: 20, ...noOutcome },
    'unknown device capacity must not be guessed as unsupported',
  );
  assert.deepEqual(
    classifyPlatformScoreComponent({ normalized: 'not-a-number', raw: Infinity }, 10),
    { status: 'missing', hasResult: false, requiredNumQubits: null, ...noOutcome },
  );
  assert.deepEqual(
    classifyPlatformScoreComponent({ required_num_qubits: true }, 0),
    { status: 'missing', hasResult: false, requiredNumQubits: null, ...noOutcome },
  );
});

// ---- Reported outcomes (metriq-data #518 / #532) ----
// The ETL stamps `reported_outcome`, `reported_outcome_reason` and
// `reported_outcome_timestamp` onto a component when an outcome record exists
// for its benchmark instance and no completed record does.

const stamped = (outcome, extra = {}) => ({
  normalized_available: false,
  raw_available: false,
  required_num_qubits: 100,
  reported_outcome: outcome,
  reported_outcome_reason: 'Compiler rejects 100-qubit circuits',
  reported_outcome_timestamp: '2026-08-07T12:00:00',
  ...extra,
});

test('reported outcomes classify by their own vocabulary', () => {
  for (const [outcome, status] of [['unsupported', 'unsupported'], ['error', 'error'], ['not_applicable', 'not_applicable']]) {
    assert.deepEqual(
      classifyPlatformScoreComponent(stamped(outcome), 108),
      {
        status,
        hasResult: false,
        requiredNumQubits: 100,
        reportedOutcome: outcome,
        reportedOutcomeReason: 'Compiler rejects 100-qubit circuits',
        reportedOutcomeTimestamp: '2026-08-07T12:00:00',
      },
    );
  }
});

test('a reported outcome takes precedence over the qubit-count heuristic in both directions', () => {
  // Enough qubits by count, but reported unsupported (e.g. connectivity limits).
  assert.equal(classifyPlatformScoreComponent(stamped('unsupported'), 108).status, 'unsupported');
  // Too few qubits by count, but a run was attempted and reported as an error.
  assert.equal(classifyPlatformScoreComponent(stamped('error'), 20).status, 'error');
  // Not applicable is reported regardless of capacity.
  assert.equal(classifyPlatformScoreComponent(stamped('not_applicable'), 20).status, 'not_applicable');
});

test('a completed result supersedes any stamped outcome', () => {
  const availability = classifyPlatformScoreComponent(
    stamped('unsupported', { normalized_available: true, normalized: 0.4, timestamp: '2026-09-01T00:00:00' }),
    108,
  );
  assert.equal(availability.status, 'submitted');
  assert.deepEqual(
    { reportedOutcome: availability.reportedOutcome, reason: availability.reportedOutcomeReason, ts: availability.reportedOutcomeTimestamp },
    { reportedOutcome: null, reason: null, ts: null },
    'a stale claim must never be shown next to a result',
  );
});

test('unknown or malformed outcome values fall back to the derived status', () => {
  for (const bad of ['Unsupported', ' unsupported', 'completed', 'failed', 42, true, null, undefined, { value: 'error' }]) {
    const tooFew = classifyPlatformScoreComponent(stamped(bad), 20);
    assert.equal(tooFew.status, 'unsupported', `${JSON.stringify(bad)} with too few qubits derives unsupported`);
    assert.equal(tooFew.reportedOutcome, null);
    const enough = classifyPlatformScoreComponent(stamped(bad), 108);
    assert.equal(enough.status, 'missing', `${JSON.stringify(bad)} with enough qubits is missing`);
  }
});

test('reported outcome reason and timestamp are optional and trimmed', () => {
  assert.deepEqual(
    classifyPlatformScoreComponent(stamped('error', { reported_outcome_reason: null, reported_outcome_timestamp: '  2026-09-04T11:26:40.462322 ' }), 108),
    {
      status: 'error',
      hasResult: false,
      requiredNumQubits: 100,
      reportedOutcome: 'error',
      reportedOutcomeReason: null,
      reportedOutcomeTimestamp: '2026-09-04T11:26:40.462322',
    },
  );
  assert.equal(classifyPlatformScoreComponent(stamped('error', { reported_outcome_reason: '   ' }), 108).reportedOutcomeReason, null);
  assert.equal(classifyPlatformScoreComponent(stamped('error', { reported_outcome_timestamp: 5 }), 108).reportedOutcomeTimestamp, null);
});

test('coverage summary shares the component resolution', () => {
  const components = {
    'EPLG-100': { normalized_available: true, normalized: 0.5 },          // covered
    'QFT-20:score': stamped('error'),                                       // runnable, uncovered
    'Linear Ramp QAOA (100q):score': stamped('unsupported'),                // reported unsupported
    'WIT-100:score': { required_num_qubits: 100 },                         // derived unsupported (device has 20)
    'CLOPS:score': stamped('not_applicable'),                               // not applicable
    'BSEQ:score': {},                                                       // missing
  };
  assert.deepEqual(summarizePlatformCoverage(components, 20), {
    covered: 1,
    runnable: 3,
    unsupported: 2,
    notApplicable: 1,
    errored: 1,
    total: 6,
  });
  // With enough qubits, the derived case becomes runnable-but-missing while
  // the reported ones are unchanged.
  assert.deepEqual(summarizePlatformCoverage(components, 200), {
    covered: 1,
    runnable: 4,
    unsupported: 1,
    notApplicable: 1,
    errored: 1,
    total: 6,
  });
});

test('coverage summary rejects non-object or empty component maps', () => {
  for (const bad of [null, undefined, [], 'components', 7, {}]) {
    assert.equal(summarizePlatformCoverage(bad, 10), null);
  }
});

test('compares left device scores using the right device as the percentage baseline', () => {
  const cases = [
    [125, 100, 25, 'high'],
    [100, 125, -20, 'low'],
    [100, 100, 0, 'equal'],
    [101, 100, 1, 'high'],
    [99, 100, -1, 'low'],
    [200, 100, 100, 'high'],
    ['125', '100', 25, 'high'],
  ];

  for (const [left, right, changePercent, tone] of cases) {
    assert.deepEqual(comparePlatformScoreValues(left, right), { changePercent, tone });
  }
});

test('handles zero and invalid platform score comparisons', () => {
  assert.deepEqual(
    comparePlatformScoreValues(0, 0),
    { tone: 'equal', changePercent: 0 },
  );
  assert.deepEqual(
    comparePlatformScoreValues(10, 0),
    { tone: 'high', changePercent: null },
  );
  assert.deepEqual(
    comparePlatformScoreValues(0, 10),
    { tone: 'low', changePercent: -100 },
  );
  for (const values of [
    [null, 10], [10, undefined], [-1, 10], [10, -1], [10, Infinity],
    [NaN, 10], ['', 10], [10, 'not-a-number'], [false, 10],
    [Number.MAX_VALUE, Number.MIN_VALUE],
  ]) {
    assert.equal(comparePlatformScoreValues(...values), null);
  }
});

test('reads display metadata from a versioned Metriq-Gym suite definition', () => {
  assert.deepEqual(
    resolveMetriqGymSuiteMetadata({
      name: ' metriq_score_1_0 ',
      version: ' 1.0 ',
      description: ' Version 1.0 of the canonical Metriq benchmark suite. ',
    }),
    {
      name: 'metriq_score_1_0',
      version: '1.0',
      description: 'Version 1.0 of the canonical Metriq benchmark suite.',
    },
  );

  assert.deepEqual(
    resolveMetriqGymSuiteMetadata({ name: 'metriq_score_2_0', version: '2.0' }),
    { name: 'metriq_score_2_0', version: '2.0', description: null },
    'future releases must be displayed from metadata rather than a hard-coded version',
  );
});

test('suite display metadata rejects malformed definitions', () => {
  for (const definition of [
    null,
    [],
    {},
    { name: '', version: '1.0' },
    { name: 'metriq_score_1_0', version: '' },
    { name: 'metriq_score_1_0', version: 1 },
    { name: 'bad\nsuite', version: '1.0' },
    { name: 'metriq_score_1_0', version: '1.0\n2.0' },
  ]) {
    assert.equal(resolveMetriqGymSuiteMetadata(definition), null);
  }

  assert.deepEqual(
    resolveMetriqGymSuiteMetadata({
      name: 'metriq_score_1_0',
      version: '1.0',
      description: {},
    }),
    { name: 'metriq_score_1_0', version: '1.0', description: null },
    'optional description metadata must not hide a valid suite version',
  );
});

test('suite releases match only when both name and version agree', () => {
  const configured = {
    name: 'metriq_score_1_0',
    version: '1.0',
    description: 'Locally configured description',
  };

  assert.equal(
    isSameMetriqGymSuiteRelease(configured, {
      ...configured,
      description: 'Description from the pinned definition',
    }),
    true,
    'description differences do not identify a different release',
  );
  assert.equal(
    isSameMetriqGymSuiteRelease(configured, { ...configured, version: '2.0' }),
    false,
  );
  assert.equal(
    isSameMetriqGymSuiteRelease(configured, { ...configured, name: 'another_suite' }),
    false,
  );
});

const suiteDefinition = {
  name: ' future_score_2_0 ',
  benchmarks: [
    {
      name: 'qft_4q',
      component: 'qft',
      config: { benchmark_name: ' Quantum Fourier Transform ' },
    },
    {
      name: 'qft_8q',
      component: ' QFT ',
      config: { benchmark_name: 'quantum fourier transform' },
    },
    {
      name: 'wit_7q',
      component: 'wit',
      config: { benchmark_name: 'WIT' },
    },
  ],
};

test('resolves repeated suite aliases to one canonical component', () => {
  assert.deepEqual(
    resolveMetriqGymSuiteDispatch(suiteDefinition, '  QUANTUM FOURIER TRANSFORM  '),
    { suite: 'future_score_2_0', component: 'qft' },
  );
  assert.deepEqual(
    resolveMetriqGymSuiteDispatch(suiteDefinition, 'wit'),
    { suite: 'future_score_2_0', component: 'wit' },
  );
});

test('falls back to a benchmark name for legacy entries without a component', () => {
  for (const component of [undefined, null, '   ']) {
    const benchmark = {
      name: 'legacy-qft',
      config: { benchmark_name: 'Quantum Fourier Transform' },
    };
    if (component !== undefined) benchmark.component = component;

    assert.deepEqual(
      resolveMetriqGymSuiteDispatch(
        { name: 'legacy_suite', benchmarks: [benchmark] },
        'quantum fourier transform',
      ),
      { suite: 'legacy_suite', component: 'legacy-qft' },
    );
  }
});

test('suite parsing fails closed for ambiguous or malformed matching entries', () => {
  const suiteWith = (...benchmarks) => ({ name: 'future_suite', benchmarks });
  const match = (component, name = 'entry') => ({
    name,
    component,
    config: { benchmark_name: 'Future benchmark' },
  });

  assert.equal(
    resolveMetriqGymSuiteDispatch(suiteWith(match('one'), match('two')), 'Future benchmark'),
    null,
  );
  assert.equal(
    resolveMetriqGymSuiteDispatch(suiteWith(match('one'), match(42)), 'Future benchmark'),
    null,
  );
  assert.equal(
    resolveMetriqGymSuiteDispatch(suiteWith(match('one'), match('bad\nselector')), 'Future benchmark'),
    null,
  );
  assert.equal(
    resolveMetriqGymSuiteDispatch(
      suiteWith({ config: { benchmark_name: 'Future benchmark' } }),
      'Future benchmark',
    ),
    null,
  );
});

test('suite parsing rejects invalid top-level data and ignores irrelevant bad entries', () => {
  const valid = {
    name: 'future_suite',
    benchmarks: [
      null,
      { name: 42, component: {}, config: { benchmark_name: 'Other benchmark' } },
      { name: 'future', component: 'future-component', config: { benchmark_name: 'Future benchmark' } },
    ],
  };
  assert.deepEqual(
    resolveMetriqGymSuiteDispatch(valid, 'future benchmark'),
    { suite: 'future_suite', component: 'future-component' },
  );

  for (const [definition, group] of [
    [null, 'Future benchmark'],
    [[], 'Future benchmark'],
    [{ name: '', benchmarks: [] }, 'Future benchmark'],
    [{ name: 'bad\nsuite', benchmarks: [] }, 'Future benchmark'],
    [{ name: 'future_suite', benchmarks: {} }, 'Future benchmark'],
    [{ name: 'future_suite', benchmarks: [] }, 'Future benchmark'],
    [valid, ''],
    [valid, 'bad\ngroup'],
  ]) {
    assert.equal(resolveMetriqGymSuiteDispatch(definition, group), null);
  }
  assert.equal(resolveMetriqGymSuiteDispatch(valid, 'Missing benchmark'), null);
});

test('builds a copyable command from parsed suite metadata', () => {
  const dispatch = resolveMetriqGymSuiteDispatch(suiteDefinition, 'Quantum Fourier Transform');
  assert.ok(dispatch);
  assert.deepEqual(
    buildMetriqGymDispatchInstructions({
      provider: 'ibm',
      device: 'ibm_fez',
      ...dispatch,
    }),
    {
      command: [
        'mgym suite dispatch future_score_2_0 \\',
        '  --component qft \\',
        '  --provider ibm \\',
        '  --device ibm_fez',
      ].join('\n'),
      suite: 'future_score_2_0',
      suiteComponent: 'qft',
      requiresRuntimeDeviceId: false,
    },
  );
});

test('missing or invalid dispatch metadata does not produce a command', () => {
  const platform = { provider: 'ibm', device: 'ibm_fez' };

  assert.equal(
    buildMetriqGymDispatchInstructions({ ...platform, suite: undefined, component: 'eplg' }),
    null,
  );
  assert.equal(
    buildMetriqGymDispatchInstructions({ ...platform, suite: 'future_score_2_0', component: '' }),
    null,
  );
  assert.equal(
    buildMetriqGymDispatchInstructions({ ...platform, suite: {}, component: 'eplg' }),
    null,
  );
});

test('AWS dispatch guidance requests the full runtime ARN when the payload only has a slug', () => {
  const missingArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    suite: 'future_score_2_0',
    component: 'lr-qaoa',
  });
  assert.equal(missingArn?.requiresRuntimeDeviceId, true);
  assert.match(missingArn?.command ?? '', /--device '<full Braket ARN for ionq_forte-1>'/);

  const withArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    suite: 'future_score_2_0',
    component: 'lr-qaoa',
    runtimeDeviceId: 'arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1',
  });
  assert.equal(withArn?.requiresRuntimeDeviceId, false);
  assert.match(withArn?.command ?? '', /--device arn:aws:braket:us-east-1::device\/qpu\/ionq\/Forte-1$/);

  const withPaddedArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    suite: 'future_score_2_0',
    component: 'lr-qaoa',
    runtimeDeviceId: '  arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1  ',
  });
  assert.equal(withPaddedArn?.requiresRuntimeDeviceId, false);
  assert.match(withPaddedArn?.command ?? '', /--device arn:aws:braket:us-east-1::device\/qpu\/ionq\/Forte-1$/);

  const invalidArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    suite: 'future_score_2_0',
    component: 'lr-qaoa',
    runtimeDeviceId: 'not-an-arn',
  });
  assert.equal(invalidArn?.requiresRuntimeDeviceId, true);
  assert.match(invalidArn?.command ?? '', /--device '<full Braket ARN for ionq_forte-1>'/);

  for (const runtimeDeviceId of ['', '   ', 'invalid\nruntime-id', 42]) {
    const unusableRuntimeId = buildMetriqGymDispatchInstructions({
      provider: 'aws',
      device: 'ionq_forte-1',
      suite: 'future_score_2_0',
      component: 'lr-qaoa',
      runtimeDeviceId,
    });
    assert.equal(unusableRuntimeId?.requiresRuntimeDeviceId, true);
    assert.match(
      unusableRuntimeId?.command ?? '',
      /--device '<full Braket ARN for ionq_forte-1>'/,
    );
  }
});

test('non-AWS platforms always use their platform device identifier', () => {
  const instructions = buildMetriqGymDispatchInstructions({
    provider: 'ibm',
    device: 'ibm_fez',
    suite: 'future_score_2_0',
    component: 'wit',
    runtimeDeviceId: 'stale-runtime-id',
  });
  assert.equal(instructions?.requiresRuntimeDeviceId, false);
  assert.match(instructions?.command ?? '', /--device ibm_fez$/);

  for (const runtimeDeviceId of ['', '   ', 'invalid\nruntime-id', 42, {}]) {
    const unusableRuntimeId = buildMetriqGymDispatchInstructions({
      provider: 'ibm',
      device: 'ibm_fez',
      suite: 'future_score_2_0',
      component: 'wit',
      runtimeDeviceId,
    });
    assert.equal(unusableRuntimeId?.requiresRuntimeDeviceId, false);
    assert.match(unusableRuntimeId?.command ?? '', /--device ibm_fez$/);
  }
});

test('dispatch command arguments are shell-quoted and control characters are rejected', () => {
  const quoted = buildMetriqGymDispatchInstructions({
    provider: 'ibm; echo unsafe',
    device: "device '$(echo unsafe)'",
    suite: 'future score; echo unsafe',
    component: 'wit; echo unsafe',
  });
  assert.match(quoted?.command ?? '', /mgym suite dispatch 'future score; echo unsafe'/);
  assert.match(quoted?.command ?? '', /--component 'wit; echo unsafe'/);
  assert.match(quoted?.command ?? '', /--provider 'ibm; echo unsafe'/);
  assert.match(quoted?.command ?? '', /--device 'device '"'"'\$\(echo unsafe\)'"'"''$/);
  assert.equal(
    buildMetriqGymDispatchInstructions({
      provider: 'ibm',
      device: 'ibm_fez',
      suite: 'future_score_2_0\necho unsafe',
      component: 'wit',
    }),
    null,
  );
  assert.equal(
    buildMetriqGymDispatchInstructions({
      provider: 'ibm',
      device: 'ibm_fez',
      suite: 'future_score_2_0',
      component: 'wit\necho unsafe',
    }),
    null,
  );
});
