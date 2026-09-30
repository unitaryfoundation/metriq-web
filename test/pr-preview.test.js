import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreviewTarget } from '../scripts/resolve-pr-preview.mjs';

const repository = { id: 1, full_name: 'unitaryfoundation/metriq-web' };
const fork = { id: 2, full_name: 'contributor/metriq-web' };
const sha = 'a'.repeat(40);

function fixture() {
  const context = {
    repo: { owner: 'unitaryfoundation', repo: 'metriq-web' },
    eventName: 'workflow_run',
    payload: {
      action: 'completed',
      repository: { ...repository },
      workflow_run: {
        id: 100, run_attempt: 2, status: 'completed', conclusion: 'success', event: 'pull_request',
        path: '.github/workflows/pr-preview.yml', repository: { ...repository },
        head_repository: { ...fork }, head_branch: 'fix/example', head_sha: sha, pull_requests: [],
      },
    },
  };
  const pr = {
    number: 53, state: 'open',
    base: { ref: 'main', repo: { ...repository } },
    head: { ref: 'fix/example', sha, repo: { ...fork } },
  };
  const data = {
    pulls: [pr],
    artifacts: [{ id: 200, name: 'pr-preview-site-2', expired: false }],
    refreshedPr: pr,
  };
  const outputs = {};
  const messages = [];
  const calls = [];
  const github = {
    rest: {
      pulls: {
        list() {},
        async get(params) {
          calls.push(['get', params]);
          return { data: data.refreshedPr };
        },
      },
      actions: { listWorkflowRunArtifacts() {} },
    },
    async paginate(method, params) {
      if (method === github.rest.pulls.list) {
        calls.push(['pulls', params]);
        return data.pulls;
      }
      assert.equal(method, github.rest.actions.listWorkflowRunArtifacts);
      calls.push(['artifacts', params]);
      return data.artifacts;
    },
  };
  const core = {
    info: (message) => messages.push(message),
    setOutput: (name, value) => { outputs[name] = value; },
  };
  return { context, pr, data, outputs, messages, calls, run: () => resolvePreviewTarget({ github, context, core }) };
}

function assertSkipped(f) {
  assert.deepEqual(f.outputs, {});
  assert.equal(f.messages.length, 1);
  assert.match(f.messages[0], /^Skipping PR preview:/);
}

test('resolves fork PRs with an empty workflow-run pull_requests array', async () => {
  const f = fixture();
  await f.run();
  assert.deepEqual(f.outputs, { action: 'deploy', 'pr-number': 53, 'artifact-id': 200 });
  assert.deepEqual(f.calls, [
    ['pulls', { owner: 'unitaryfoundation', repo: 'metriq-web', state: 'open', base: 'main', head: 'contributor:fix/example', per_page: 100 }],
    ['artifacts', { owner: 'unitaryfoundation', repo: 'metriq-web', run_id: 100, per_page: 100 }],
  ]);
});

test('also resolves same-repository PRs', async () => {
  const f = fixture();
  f.context.payload.workflow_run.head_repository = { ...repository };
  f.pr.head.repo = { ...repository };
  await f.run();
  assert.equal(f.outputs.action, 'deploy');
  assert.equal(f.calls[0][1].head, 'unitaryfoundation:fix/example');
});

for (const [name, change] of [
  ['stale commit', (f) => { f.pr.head.sha = 'b'.repeat(40); }],
  ['different head branch', (f) => { f.pr.head.ref = 'other'; }],
  ['different head repository ID', (f) => { f.pr.head.repo.id = 3; }],
  ['different head repository name', (f) => { f.pr.head.repo.full_name = 'other/metriq-web'; }],
  ['different base repository ID', (f) => { f.pr.base.repo.id = 3; }],
  ['different base repository name', (f) => { f.pr.base.repo.full_name = 'other/metriq-web'; }],
  ['different base branch', (f) => { f.pr.base.ref = 'other'; }],
  ['closed PR', (f) => { f.pr.state = 'closed'; }],
  ['invalid PR number', (f) => { f.pr.number = '../53'; }],
]) {
  test(`skips ${name} even if the list API returns it`, async () => {
    const f = fixture();
    change(f);
    await f.run();
    assertSkipped(f);
    assert.equal(f.calls.length, 1);
  });
}

for (const [name, change] of [
  ['failed build', (run) => { run.conclusion = 'failure'; }],
  ['incomplete build', (run) => { run.status = 'in_progress'; }],
  ['push build', (run) => { run.event = 'push'; }],
  ['different workflow', (run) => { run.path = '.github/workflows/other.yml'; }],
  ['different run repository', (run) => { run.repository.id = 3; }],
  ['invalid run ID', (run) => { run.id = '100'; }],
  ['invalid attempt', (run) => { run.run_attempt = '../2'; }],
  ['invalid head SHA', (run) => { run.head_sha = 'main'; }],
  ['invalid head repository name', (run) => { run.head_repository.full_name = '../contributor/metriq-web'; }],
]) {
  test(`skips ${name} before querying PRs`, async () => {
    const f = fixture();
    change(f.context.payload.workflow_run);
    await f.run();
    assertSkipped(f);
    assert.deepEqual(f.calls, []);
  });
}

test('rejects ambiguous PR matches', async () => {
  const f = fixture();
  f.data.pulls.push({ ...f.pr, number: 54 });
  await assert.rejects(f.run, /Multiple pull requests/);
  assert.deepEqual(f.outputs, {});
  assert.equal(f.calls.length, 1);
});

for (const [name, artifacts] of [
  ['missing artifact', []],
  ['artifact from an earlier attempt', [{ id: 200, name: 'pr-preview-site-1', expired: false }]],
  ['expired artifact', [{ id: 200, name: 'pr-preview-site-2', expired: true }]],
  ['invalid artifact ID', [{ id: '../200', name: 'pr-preview-site-2', expired: false }]],
]) {
  test(`skips ${name}`, async () => {
    const f = fixture();
    f.data.artifacts = artifacts;
    await f.run();
    assertSkipped(f);
  });
}

test('rejects ambiguous preview artifacts', async () => {
  const f = fixture();
  f.data.artifacts.push({ ...f.data.artifacts[0], id: 201 });
  await assert.rejects(f.run, /Multiple preview artifacts/);
  assert.deepEqual(f.outputs, {});
});

function cleanupFixture() {
  const f = fixture();
  f.context.eventName = 'pull_request_target';
  f.context.payload.action = 'closed';
  f.context.payload.pull_request = { number: 53 };
  f.pr.state = 'closed';
  return f;
}

test('refreshes a closed PR before removing its preview', async () => {
  const f = cleanupFixture();
  await f.run();
  assert.deepEqual(f.outputs, { action: 'remove', 'pr-number': 53 });
  assert.deepEqual(f.calls, [['get', { owner: 'unitaryfoundation', repo: 'metriq-web', pull_number: 53 }]]);
});

for (const [name, change] of [
  ['reopened PR', (f) => { f.pr.state = 'open'; }],
  ['different base branch', (f) => { f.pr.base.ref = 'other'; }],
  ['different repository', (f) => { f.pr.base.repo.id = 3; }],
  ['unexpected PR number', (f) => { f.pr.number = 54; }],
]) {
  test(`skips cleanup for a ${name}`, async () => {
    const f = cleanupFixture();
    change(f);
    await f.run();
    assertSkipped(f);
    assert.equal(f.calls.length, 1);
  });
}

test('rejects invalid event identifiers before querying GitHub', async () => {
  for (const change of [
    (f) => { f.context.payload.pull_request.number = '../53'; },
    (f) => { f.context.payload.repository.full_name = 'other/metriq-web'; },
    (f) => { f.context.payload.repository.id = '1'; },
  ]) {
    const f = cleanupFixture();
    change(f);
    await f.run();
    assertSkipped(f);
    assert.deepEqual(f.calls, []);
  }
});
