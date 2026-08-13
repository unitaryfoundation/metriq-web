import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetriqGymDispatchInstructions,
  sortPlatformScoreComponents,
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

test('builds a copyable command from payload-provided dispatch metadata', () => {
  assert.deepEqual(
    buildMetriqGymDispatchInstructions({
      provider: 'ibm',
      device: 'ibm_fez',
      suite: 'future_score_2_0',
      component: 'future-eplg',
    }),
    {
      command: [
        'mgym suite dispatch future_score_2_0 \\',
        '  --component future-eplg \\',
        '  --provider ibm \\',
        '  --device ibm_fez',
      ].join('\n'),
      suite: 'future_score_2_0',
      suiteComponent: 'future-eplg',
      requiresRuntimeDeviceId: false,
    },
  );
});

test('missing or invalid payload dispatch metadata does not produce a command', () => {
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

  const invalidArn = buildMetriqGymDispatchInstructions({
    provider: 'aws',
    device: 'ionq_forte-1',
    suite: 'future_score_2_0',
    component: 'lr-qaoa',
    runtimeDeviceId: 'not-an-arn',
  });
  assert.equal(invalidArn?.requiresRuntimeDeviceId, true);
  assert.match(invalidArn?.command ?? '', /--device '<full Braket ARN for ionq_forte-1>'/);
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
