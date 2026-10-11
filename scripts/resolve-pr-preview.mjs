const PREVIEW_WORKFLOW = '.github/workflows/pr-preview.yml';

const isId = (value) => Number.isSafeInteger(value) && value > 0;
const sameRepository = (left, right) =>
  isId(left?.id) && left.id === right?.id && left.full_name === right.full_name;

/** Resolve deployment metadata from GitHub, never from an untrusted build artifact. */
export async function resolvePreviewTarget({ github, context, core }) {
  const { owner, repo } = context.repo;
  const repository = context.payload.repository;
  const skip = (reason) => core.info(`Skipping PR preview: ${reason}`);

  if (!isId(repository?.id) || repository.full_name !== `${owner}/${repo}`) {
    return skip('event repository does not match the current repository');
  }

  const targetsMain = (pr) =>
    pr.base?.ref === 'main' && sameRepository(pr.base.repo, repository);

  if (context.eventName === 'pull_request_target' && context.payload.action === 'closed') {
    const number = context.payload.pull_request?.number;
    if (!isId(number)) return skip('invalid pull request number');

    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: number });
    if (pr.number !== number || pr.state !== 'closed' || !targetsMain(pr)) {
      return skip('pull request is no longer closed or does not target main');
    }

    core.setOutput('action', 'remove');
    core.setOutput('pr-number', number);
    return;
  }

  const run = context.payload.workflow_run;
  if (
    context.eventName !== 'workflow_run' || context.payload.action !== 'completed' ||
    run?.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'pull_request' ||
    run.path !== PREVIEW_WORKFLOW || !sameRepository(run.repository, repository)
  ) {
    return skip('run is not a successful PR preview build in this repository');
  }

  const head = run.head_repository;
  if (
    !isId(run.id) || !isId(run.run_attempt) || !isId(head?.id) ||
    typeof head.full_name !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(head.full_name) ||
    typeof run.head_branch !== 'string' || !run.head_branch || /[\0\r\n]/.test(run.head_branch) ||
    typeof run.head_sha !== 'string' || !/^[a-f\d]{40}$/i.test(run.head_sha)
  ) {
    return skip('run has invalid identifiers');
  }

  // Fork workflow runs can have an empty pull_requests array. Resolve the current
  // PR through the API and check its exact repository, branch, and commit instead.
  const [headOwner] = head.full_name.split('/');
  const pulls = await github.paginate(github.rest.pulls.list, {
    owner, repo, state: 'open', base: 'main', head: `${headOwner}:${run.head_branch}`, per_page: 100,
  });
  const matches = pulls.filter((pr) =>
    isId(pr.number) && pr.state === 'open' && targetsMain(pr) &&
    sameRepository(pr.head?.repo, head) && pr.head.ref === run.head_branch && pr.head.sha === run.head_sha,
  );
  if (matches.length > 1) throw new Error('Multiple pull requests match the preview build');
  if (matches.length === 0) return skip('no open PR matches the build commit');

  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    owner, repo, run_id: run.id, per_page: 100,
  });
  const matchingArtifacts = artifacts.filter((artifact) =>
    artifact.name === `pr-preview-site-${run.run_attempt}`,
  );
  if (matchingArtifacts.length > 1) throw new Error('Multiple preview artifacts match the build attempt');
  const artifact = matchingArtifacts[0];
  if (!artifact || artifact.expired !== false || !isId(artifact.id)) {
    return skip('build attempt has no available preview artifact');
  }

  core.setOutput('action', 'deploy');
  core.setOutput('pr-number', matches[0].number);
  core.setOutput('artifact-id', artifact.id);
}
