// ---- Record aggregation helpers ----
// Pure functions shared by the app (main.ts) and the Node test suite.
//
// The dataset can contain multiple records for the same provider/device/
// benchmark. Records are true duplicates only when they also represent the
// same benchmark instance — matching params up to sampling-effort settings.
// Records that differ in a meaningful parameter (e.g. num_qubits) are
// distinct results and must all stay visible.

export type RecordAggMode = 'all-time' | 'latest';
export const DEFAULT_HIDDEN_PROVIDERS = ['local'];

// ---- Record outcomes ----
// metriq-data records may carry a non-completed `outcome` (see the "Record
// outcomes" section of the metriq-data README): `error` = the attempt failed,
// `unsupported` = the device structurally cannot run this benchmark instance,
// `not_applicable` = the benchmark does not apply to the device category. A
// record without the field (or with `completed`) is a completed run. The
// vocabulary is strict and lowercase; anything else is treated as absent so a
// malformed value can never be mistaken for a reported outcome.
export type RecordOutcome = 'error' | 'unsupported' | 'not_applicable';
export const RECORD_OUTCOMES: readonly RecordOutcome[] = ['error', 'unsupported', 'not_applicable'];

export type RecordOutcomeDetail = {
  reason: string | null;
  errorMessage: string | null;
  source: string | null;
  sourceUrl: string | null;
};

export function normalizeRecordOutcome(value: unknown): RecordOutcome | null {
  return typeof value === 'string' && (RECORD_OUTCOMES as readonly string[]).includes(value)
    ? value as RecordOutcome
    : null;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeRecordOutcomeDetail(value: unknown): RecordOutcomeDetail | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const detail = value as Record<string, unknown>;
  const normalized: RecordOutcomeDetail = {
    reason: optionalText(detail.reason),
    errorMessage: optionalText(detail.error_message),
    source: optionalText(detail.source),
    sourceUrl: optionalText(detail.source_url),
  };
  return Object.values(normalized).some((v) => v !== null) ? normalized : null;
}

// Providers can remain in metriq-data as source-of-truth records while being
// omitted from a particular UI deployment (for example, local simulators on
// the production website). Matching is case-insensitive and whitespace-safe.
export function hiddenProvidersFromConfig(config: any): Set<string> {
  const providers = Array.isArray(config?.hiddenProviders)
    ? config.hiddenProviders
    : DEFAULT_HIDDEN_PROVIDERS;
  return new Set(
    providers
      .map((provider: any) => String(provider ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isProviderHidden(provider: any, config: any): boolean {
  const normalized = String(provider ?? '').trim().toLowerCase();
  return Boolean(normalized) && hiddenProvidersFromConfig(config).has(normalized);
}

export function withoutHiddenProviders<T extends { provider?: any }>(items: T[], config: any): T[] {
  if (!Array.isArray(items)) return [];
  const hidden = hiddenProvidersFromConfig(config);
  if (!hidden.size) return items.slice();
  return items.filter((item) => !hidden.has(String(item?.provider ?? '').trim().toLowerCase()));
}

// Params that describe sampling effort rather than the benchmark instance.
export const RECORD_SIG_EXCLUDED_PARAMS = new Set(['shots', 'num_circuits', 'num_random_trials', 'trials', 'seed', 'confidence_level']);

export function recordInstanceSig(params: any): string {
  const p = (params && typeof params === 'object') ? params : {};
  const keys = Object.keys(p).filter((k) => !RECORD_SIG_EXCLUDED_PARAMS.has(k)).sort();
  return JSON.stringify(keys.map((k) => [k, p[k]]));
}

function runTimestampMs(run: any): number {
  const t = Number(new Date(run?.timestamp));
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

export function isPreferredRecord(
  candidate: any,
  incumbent: any,
  mode: RecordAggMode,
  getValue: (run: any) => number | null,
): boolean {
  const cv = getValue(candidate);
  const iv = getValue(incumbent);
  if (mode === 'latest') {
    // Newest record wins, but a record with a displayable value beats one
    // without (some records lack a metriq_score and would render as "—").
    if ((cv === null) !== (iv === null)) return cv !== null;
    return runTimestampMs(candidate) > runTimestampMs(incumbent);
  }
  // 'all-time': higher metric value wins (surfaced metrics are higher-is-better);
  // records without a value lose, and ties go to the more recent record.
  const c = cv === null ? Number.NEGATIVE_INFINITY : cv;
  const i = iv === null ? Number.NEGATIVE_INFINITY : iv;
  if (c !== i) return c > i;
  return runTimestampMs(candidate) > runTimestampMs(incumbent);
}

// Collapse true duplicates — same provider/device/benchmark AND same instance
// signature — keeping one record per the aggregation mode. Records that differ
// in meaningful params (e.g. qubit count) land in different groups and are all
// returned.
export function dedupeRunsForDisplay(
  runs: any[],
  mode: RecordAggMode,
  getValue: (run: any) => number | null,
): any[] {
  if (!Array.isArray(runs) || runs.length <= 1) return Array.isArray(runs) ? runs : [];
  const byGroup = new Map<string, any>();
  runs.forEach((run) => {
    const key = `${String(run?.provider || '')}::${String(run?.device || '')}::${String(run?.benchmark || '')}::${recordInstanceSig(run?.rawParams)}`;
    const prev = byGroup.get(key);
    if (!prev || isPreferredRecord(run, prev, mode, getValue)) {
      byGroup.set(key, run);
    }
  });
  return byGroup.size === runs.length ? runs : Array.from(byGroup.values());
}

// For displayed runs that share a provider/device/benchmark, summarize the
// params that distinguish each run from its siblings (e.g. "num_layers=4").
// Sampling-effort params and params listed in extraExcludedKeys (ones already
// shown elsewhere, like num_qubits in the Qubits column) are left out. Runs
// with nothing to distinguish map to ''.
export function variantParamSummaries(runs: any[], extraExcludedKeys: string[] = []): Map<any, string> {
  const summaries = new Map<any, string>();
  if (!Array.isArray(runs)) return summaries;
  const excluded = new Set([...RECORD_SIG_EXCLUDED_PARAMS, ...extraExcludedKeys]);
  const groups = new Map<string, any[]>();
  runs.forEach((run) => {
    const key = `${String(run?.provider || '')}::${String(run?.device || '')}::${String(run?.benchmark || '')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(run);
    summaries.set(run, '');
  });
  groups.forEach((group) => {
    if (group.length <= 1) return;
    const paramsOf = (run: any) => (run?.rawParams && typeof run.rawParams === 'object') ? run.rawParams : {};
    const candidateKeys = new Set<string>();
    group.forEach((run) => {
      Object.keys(paramsOf(run)).forEach((k) => { if (!excluded.has(k)) candidateKeys.add(k); });
    });
    const varyingKeys = Array.from(candidateKeys).filter((k) => {
      const seen = new Set(group.map((run) => JSON.stringify(paramsOf(run)[k])));
      return seen.size > 1;
    }).sort();
    if (!varyingKeys.length) return;
    group.forEach((run) => {
      const p = paramsOf(run);
      const parts = varyingKeys
        .map((k) => {
          const v = p[k];
          if (v === undefined) return `${k}=—`;
          return `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`;
        });
      summaries.set(run, parts.join(', '));
    });
  });
  return summaries;
}
