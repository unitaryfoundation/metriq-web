import { RecordOutcome, normalizeRecordOutcome } from './records.js';

export type PlatformScoreComponentEntry = [string, any];

// Component status, in precedence order:
//   submitted      — a completed record exists (always wins).
//   unsupported    — the device cannot run this instance: either reported by
//                    an outcome record, or derived from the device having
//                    fewer qubits than the component requires.
//   error          — a reported attempt failed (possibly transiently). Still
//                    runnable, so it stays in the coverage denominator.
//   not_applicable — reported: the benchmark does not apply to this device.
//   missing        — nothing recorded; a runnable benchmark awaiting a run.
export type PlatformScoreComponentStatus = 'submitted' | 'unsupported' | 'error' | 'not_applicable' | 'missing';

export type PlatformScoreComponentAvailability = {
  status: PlatformScoreComponentStatus;
  hasResult: boolean;
  requiredNumQubits: number | null;
  // Outcome stamped by metriq-data onto the component (`reported_outcome`,
  // `reported_outcome_reason`, `reported_outcome_timestamp`); null when the
  // status was derived from device metadata or nothing is recorded.
  reportedOutcome: RecordOutcome | null;
  reportedOutcomeReason: string | null;
  reportedOutcomeTimestamp: string | null;
};

export type PlatformCoverage = {
  covered: number;
  // Components the device can run: everything except unsupported and
  // not-applicable ones. Reported errors stay runnable but uncovered.
  runnable: number;
  unsupported: number;
  notApplicable: number;
  errored: number;
  total: number;
};

export type PlatformScoreComparison = {
  tone: 'equal' | 'low' | 'high';
  changePercent: number | null;
};

export type MetriqGymDispatchInstructions = {
  command: string;
  suite: string;
  suiteComponent: string;
  requiresRuntimeDeviceId: boolean;
};

export type MetriqGymSuiteDispatch = {
  suite: string;
  component: string;
};

export type MetriqGymSuiteMetadata = {
  name: string;
  version: string;
  description: string | null;
};

const platformComponentCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function platformComponentGroup([name, component]: PlatformScoreComponentEntry) {
  const group = typeof component?.group === 'string' ? component.group.trim() : '';
  return group || name;
}

export function sortPlatformScoreComponents(entries: PlatformScoreComponentEntry[]) {
  return entries.slice().sort((a, b) => {
    const groupDiff = platformComponentCollator.compare(
      platformComponentGroup(a),
      platformComponentGroup(b),
    );
    if (groupDiff !== 0) return groupDiff;
    return platformComponentCollator.compare(a[0], b[0]);
  });
}

export function mergePlatformScoreComponents(
  componentSets: Array<Record<string, any>>,
) {
  const merged = new Map<string, any>();
  componentSets.forEach((components) => {
    Object.entries(components).forEach(([name, component]) => {
      const current = merged.get(name);
      const currentGroup = typeof current?.group === 'string' ? current.group.trim() : '';
      const nextGroup = typeof component?.group === 'string' ? component.group.trim() : '';
      if (!merged.has(name) || (!currentGroup && nextGroup)) merged.set(name, component);
    });
  });
  return sortPlatformScoreComponents(Array.from(merged.entries()));
}

function finiteNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function classifyPlatformScoreComponent(
  component: any,
  deviceNumQubits: number | null,
): PlatformScoreComponentAvailability {
  const hasResult = component?.normalized_available === true
    || component?.raw_available === true
    || finiteNumber(component?.normalized) !== null
    || finiteNumber(component?.raw) !== null
    || Boolean(component?.timestamp || component?.normalized_timestamp || component?.raw_timestamp);
  const requiredNumQubits = finiteNumber(component?.required_num_qubits);
  // A completed record supersedes any reported outcome for the instance (the
  // ETL never stamps both, but never show a stale claim next to a result).
  const reportedOutcome = hasResult ? null : normalizeRecordOutcome(component?.reported_outcome);
  const reportedOutcomeReason = reportedOutcome ? optionalText(component?.reported_outcome_reason) : null;
  const reportedOutcomeTimestamp = reportedOutcome ? optionalText(component?.reported_outcome_timestamp) : null;
  // The qubit-count heuristic only applies when nothing was reported: a
  // reported outcome is evidence from an actual attempt and takes precedence
  // in both directions (a device may have enough qubits but not enough
  // connected ones, or a reported error may contradict a count-based guess).
  const derivedUnsupported = !hasResult
    && reportedOutcome === null
    && requiredNumQubits !== null
    && deviceNumQubits !== null
    && deviceNumQubits < requiredNumQubits;

  let status: PlatformScoreComponentStatus;
  if (hasResult) status = 'submitted';
  else if (reportedOutcome) status = reportedOutcome;
  else if (derivedUnsupported) status = 'unsupported';
  else status = 'missing';

  return {
    status,
    hasResult,
    requiredNumQubits,
    reportedOutcome,
    reportedOutcomeReason,
    reportedOutcomeTimestamp,
  };
}

// One resolution shared by the Coverage column, the compare view and the
// per-component status chips, so the percentage always matches the chips.
export function summarizePlatformCoverage(
  components: unknown,
  deviceNumQubits: number | null,
): PlatformCoverage | null {
  if (!components || typeof components !== 'object' || Array.isArray(components)) return null;
  const values = Object.values(components as Record<string, any>);
  if (!values.length) return null;
  const coverage: PlatformCoverage = {
    covered: 0,
    runnable: 0,
    unsupported: 0,
    notApplicable: 0,
    errored: 0,
    total: values.length,
  };
  values.forEach((component) => {
    const { status } = classifyPlatformScoreComponent(component, deviceNumQubits);
    if (status === 'submitted') coverage.covered += 1;
    else if (status === 'unsupported') coverage.unsupported += 1;
    else if (status === 'not_applicable') coverage.notApplicable += 1;
    else if (status === 'error') coverage.errored += 1;
  });
  coverage.runnable = coverage.total - coverage.unsupported - coverage.notApplicable;
  return coverage;
}

export function comparePlatformScoreValues(
  leftValue: unknown,
  rightValue: unknown,
): PlatformScoreComparison | null {
  const left = finiteNumber(leftValue);
  const right = finiteNumber(rightValue);
  if (left === null || right === null || left < 0 || right < 0) return null;

  const changePercent = left === right ? 0 : right === 0 ? null : ((left - right) / right) * 100;
  if (changePercent !== null && !Number.isFinite(changePercent)) return null;

  return {
    tone: left === right ? 'equal' : left > right ? 'high' : 'low',
    changePercent,
  };
}

function commandArgument(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function resolveMetriqGymSuiteMetadata(
  suiteDefinition: unknown,
): MetriqGymSuiteMetadata | null {
  const definition = objectRecord(suiteDefinition);
  if (!definition) return null;

  const name = commandArgument(definition.name);
  const version = commandArgument(definition.version);
  if (!name || !version) return null;

  let description: string | null = null;
  if (definition.description !== undefined && definition.description !== null) {
    description = commandArgument(definition.description);
  }

  return { name, version, description };
}

export function isSameMetriqGymSuiteRelease(
  left: MetriqGymSuiteMetadata,
  right: MetriqGymSuiteMetadata,
) {
  return left.name === right.name && left.version === right.version;
}

function suiteLookupKey(value: unknown) {
  const normalized = commandArgument(value);
  return normalized?.toLocaleLowerCase('en-US') ?? null;
}

function suiteBenchmarkSelector(benchmark: Record<string, unknown>) {
  const rawComponent = benchmark.component;
  if (rawComponent !== undefined && rawComponent !== null) {
    if (typeof rawComponent !== 'string') return null;
    if (/[\u0000-\u001f\u007f]/.test(rawComponent)) return null;
    const component = rawComponent.trim();
    if (component) return component;
  }
  return commandArgument(benchmark.name);
}

export function resolveMetriqGymSuiteDispatch(
  suiteDefinition: unknown,
  group: unknown,
): MetriqGymSuiteDispatch | null {
  const definition = objectRecord(suiteDefinition);
  const requestedAlias = suiteLookupKey(group);
  if (!definition || !requestedAlias) return null;

  const suite = commandArgument(definition.name);
  const benchmarks = definition.benchmarks;
  if (!suite || !Array.isArray(benchmarks)) return null;

  let component: string | null = null;
  let componentKey: string | null = null;
  for (const value of benchmarks) {
    const benchmark = objectRecord(value);
    const config = objectRecord(benchmark?.config);
    if (!benchmark || !config) continue;
    if (suiteLookupKey(config.benchmark_name) !== requestedAlias) continue;

    const selector = suiteBenchmarkSelector(benchmark);
    if (!selector) return null;

    const selectorKey = selector.toLocaleLowerCase('en-US');
    if (componentKey !== null && selectorKey !== componentKey) return null;
    if (component === null) component = selector;
    componentKey = selectorKey;
  }

  return component ? { suite, component } : null;
}

function quotePosixShellArgument(value: string) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildMetriqGymDispatchInstructions({
  provider,
  device,
  suite,
  component,
  runtimeDeviceId,
}: {
  provider: unknown;
  device: unknown;
  suite: unknown;
  component: unknown;
  runtimeDeviceId?: unknown;
}): MetriqGymDispatchInstructions | null {
  const providerArgument = commandArgument(provider);
  const platformDevice = commandArgument(device);
  const suiteArgument = commandArgument(suite);
  const suiteComponent = commandArgument(component);
  if (!providerArgument || !platformDevice || !suiteArgument || !suiteComponent) return null;

  const isAws = ['aws', 'braket'].includes(providerArgument.toLocaleLowerCase('en-US'));
  // Runtime identifiers are optional metadata. Ignore unusable values rather
  // than suppressing otherwise valid dispatch guidance.
  const suppliedRuntimeDevice = commandArgument(runtimeDeviceId);

  const validAwsRuntimeDevice = isAws && suppliedRuntimeDevice && /^arn:[^:]+:braket:[^:]+:[^:]*:device\/.+$/i.test(suppliedRuntimeDevice)
    ? suppliedRuntimeDevice
    : null;
  const requiresRuntimeDeviceId = isAws && !validAwsRuntimeDevice;
  const deviceArgument = validAwsRuntimeDevice
    ?? (requiresRuntimeDeviceId ? `<full Braket ARN for ${platformDevice}>` : platformDevice);
  const command = [
    `mgym suite dispatch ${quotePosixShellArgument(suiteArgument)} \\`,
    `  --component ${quotePosixShellArgument(suiteComponent)} \\`,
    `  --provider ${quotePosixShellArgument(providerArgument)} \\`,
    `  --device ${quotePosixShellArgument(deviceArgument)}`,
  ].join('\n');

  return { command, suite: suiteArgument, suiteComponent, requiresRuntimeDeviceId };
}
