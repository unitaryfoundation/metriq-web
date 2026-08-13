import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetriqGymDispatchInstructions,
  sortPlatformScoreComponents,
  suiteComponentForPlatformGroup,
} from '../platform-components.js';

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

test('platform score groups map to Metriq Score 1.0 suite components', () => {
  assert.deepEqual(
    [
      'BSEQ',
      'CLOPS',
      'EPLG',
      'Linear Ramp QAOA',
      'Mirror Circuits',
      'QML Kernel',
      'Quantum Fourier Transform',
      'WIT',
    ].map(suiteComponentForPlatformGroup),
    ['bseq', 'clops', 'eplg', 'lr-qaoa', 'mirror-circuits', 'qml-kernel', 'qft', 'wit'],
  );
  assert.equal(suiteComponentForPlatformGroup('  ePlG  '), 'eplg');
  assert.equal(suiteComponentForPlatformGroup('Unknown benchmark'), null);
});

test('builds a copyable component dispatch command for a platform', () => {
  assert.deepEqual(
    buildMetriqGymDispatchInstructions({
      provider: 'ibm',
      device: 'ibm_fez',
      group: 'EPLG',
    }),
    {
      command: [
        'mgym suite dispatch metriq_score_1_0 \\',
        '  --component eplg \\',
        '  --provider ibm \\',
        '  --device ibm_fez',
      ].join('\n'),
      suiteComponent: 'eplg',
      requiresRuntimeDeviceId: false,
    },
  );
});

test('AWS dispatch guidance requests the full runtime ARN when the payload only has a slug', () => {
  const missingArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    group: 'Linear Ramp QAOA',
  });
  assert.equal(missingArn?.requiresRuntimeDeviceId, true);
  assert.match(missingArn?.command ?? '', /--device '<full Braket ARN for ionq_forte-1>'/);

  const withArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    group: 'Linear Ramp QAOA',
    runtimeDeviceId: 'arn:aws:braket:us-east-1::device/qpu/ionq/Forte-1',
  });
  assert.equal(withArn?.requiresRuntimeDeviceId, false);
  assert.match(withArn?.command ?? '', /--device arn:aws:braket:us-east-1::device\/qpu\/ionq\/Forte-1$/);

  const invalidArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    group: 'Linear Ramp QAOA',
    runtimeDeviceId: 'not-an-arn',
  });
  assert.equal(invalidArn?.requiresRuntimeDeviceId, true);
  assert.match(invalidArn?.command ?? '', /--device '<full Braket ARN for ionq_forte-1>'/);
});

test('non-AWS platforms always use their platform device identifier', () => {
  const instructions = buildMetriqGymDispatchInstructions({
    provider: 'ibm',
    device: 'ibm_fez',
    group: 'WIT',
    runtimeDeviceId: 'stale-runtime-id',
  });
  assert.equal(instructions?.requiresRuntimeDeviceId, false);
  assert.match(instructions?.command ?? '', /--device ibm_fez$/);
});

test('dispatch command arguments are shell-quoted and control characters are rejected', () => {
  const quoted = buildMetriqGymDispatchInstructions({
    provider: 'ibm; echo unsafe',
    device: "device '$(echo unsafe)'",
    group: 'WIT',
  });
  assert.match(quoted?.command ?? '', /--provider 'ibm; echo unsafe'/);
  assert.match(quoted?.command ?? '', /--device 'device '"'"'\$\(echo unsafe\)'"'"''$/);
  assert.equal(
    buildMetriqGymDispatchInstructions({ provider: 'ibm\necho unsafe', device: 'ibm_fez', group: 'WIT' }),
    null,
  );
});
