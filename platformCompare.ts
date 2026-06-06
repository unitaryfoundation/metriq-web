type PlatformDetail = Record<string, any>;

type ComparisonCell = string;

type OverviewRow = {
  label: string;
  left: ComparisonCell;
  right: ComparisonCell;
  delta?: ComparisonCell;
};

type ComponentRow = {
  name: string;
  weight: string;
  leftRaw: string;
  rightRaw: string;
  leftNormalized: string;
  rightNormalized: string;
  normalizedDelta: string;
  leftTimestamp: string;
  rightTimestamp: string;
};

type MetadataRow = {
  label: string;
  left: string;
  right: string;
};

(() => {
const comparisonMissingValue = "—";

function toFiniteComparisonNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatComparisonNumber(value: any, digits = 2): string {
  const num = toFiniteComparisonNumber(value);
  return num === null ? comparisonMissingValue : num.toFixed(digits);
}

function formatComparisonInteger(value: any): string {
  const num = toFiniteComparisonNumber(value);
  return num === null ? comparisonMissingValue : String(Math.round(num));
}

function formatComparisonPercent(value: any): string {
  const num = toFiniteComparisonNumber(value);
  if (num === null) return comparisonMissingValue;
  return `${(num * 100).toFixed(1)}%`;
}

function formatMetricValue(value: any): string {
  const num = toFiniteComparisonNumber(value);
  if (num === null) {
    if (value === null || value === undefined || value === "") return comparisonMissingValue;
    return String(value);
  }
  const abs = Math.abs(num);
  if ((abs !== 0 && abs < 1e-4) || abs >= 1e6) return num.toExponential(3);
  if (abs < 1) return num.toFixed(3);
  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function formatSignedDifference(left: any, right: any, digits = 2): string {
  const leftNum = toFiniteComparisonNumber(left);
  const rightNum = toFiniteComparisonNumber(right);
  if (leftNum === null || rightNum === null) return comparisonMissingValue;
  const delta = leftNum - rightNum;
  const formatted = digits === 0 ? String(Math.round(Math.abs(delta))) : Math.abs(delta).toFixed(digits);
  if (delta > 0) return `+${formatted}`;
  if (delta < 0) return `-${formatted}`;
  return digits === 0 ? "0" : (0).toFixed(digits);
}

function formatSignedPercentDifference(left: any, right: any): string {
  const leftNum = toFiniteComparisonNumber(left);
  const rightNum = toFiniteComparisonNumber(right);
  if (leftNum === null || rightNum === null) return comparisonMissingValue;
  const delta = (leftNum - rightNum) * 100;
  if (delta > 0) return `+${delta.toFixed(1)}%`;
  if (delta < 0) return `${delta.toFixed(1)}%`;
  return "0.0%";
}

function formatDateOnlyValue(value: any): string {
  if (!value) return comparisonMissingValue;
  const str = String(value);
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const date = new Date(str);
  if (!Number.isFinite(date.getTime())) return str;
  return date.toISOString().slice(0, 10);
}

function getPlatformProvider(detail: PlatformDetail): string {
  return String(detail?.provider || "Unknown");
}

function getPlatformDevice(detail: PlatformDetail): string {
  return String(detail?.device || "Unknown");
}

function getPlatformMetadata(detail: PlatformDetail): Record<string, any> {
  const metadata = detail?.current?.device_metadata ?? detail?.device_metadata ?? null;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function getPlatformRunsCount(detail: PlatformDetail): number | null {
  const runs = detail?.runs;
  if (Array.isArray(runs)) return runs.length;
  return toFiniteComparisonNumber(runs);
}

function extractNumQubits(detail: PlatformDetail): number | null {
  const metadata = getPlatformMetadata(detail);
  const candidates = [
    metadata.num_qubits,
    metadata.max_qubits,
    metadata.qubits,
    metadata.width,
    detail?.num_qubits,
    detail?.numQubits,
  ];
  for (const candidate of candidates) {
    const num = toFiniteComparisonNumber(candidate);
    if (num !== null) return num;
  }
  return null;
}

function getCoverageValue(detail: PlatformDetail): number | null {
  const explicit = toFiniteComparisonNumber(detail?.metriq_score?.coverage);
  if (explicit !== null) return explicit;
  const components = detail?.metriq_score?.components;
  if (!components || typeof components !== "object") return null;
  const values = Object.values(components as Record<string, any>);
  if (!values.length) return null;
  let covered = 0;
  values.forEach((component: any) => {
    const hasRaw = toFiniteComparisonNumber(component?.raw) !== null;
    const hasNormalized = toFiniteComparisonNumber(component?.normalized) !== null;
    if (
      component?.raw_available === true ||
      component?.normalized_available === true ||
      hasRaw ||
      hasNormalized ||
      Boolean(component?.timestamp || component?.raw_timestamp || component?.normalized_timestamp)
    ) {
      covered += 1;
    }
  });
  return covered / values.length;
}

function formatDisplayValue(value: any): string {
  if (value === null || value === undefined || value === "") return comparisonMissingValue;
  if (Array.isArray(value)) return value.map((item) => formatDisplayValue(item)).join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return formatMetricValue(value);
  return String(value);
}

function getComponentTimestamp(component: any): string {
  return formatDateOnlyValue(
    component?.timestamp || component?.normalized_timestamp || component?.raw_timestamp,
  );
}

function getComponentWeight(leftComponent: any, rightComponent: any): string {
  const leftWeight = toFiniteComparisonNumber(leftComponent?.weight);
  const rightWeight = toFiniteComparisonNumber(rightComponent?.weight);
  if (leftWeight === null && rightWeight === null) return comparisonMissingValue;
  if (leftWeight !== null && rightWeight !== null && Math.abs(leftWeight - rightWeight) > 1e-9) {
    return `${leftWeight.toFixed(2)} / ${rightWeight.toFixed(2)}`;
  }
  const weight = leftWeight !== null ? leftWeight : rightWeight;
  return weight === null ? comparisonMissingValue : weight.toFixed(2);
}

function buildComponentRows(left: PlatformDetail, right: PlatformDetail): ComponentRow[] {
  const leftComponents = left?.metriq_score?.components && typeof left.metriq_score.components === "object"
    ? left.metriq_score.components as Record<string, any>
    : {};
  const rightComponents = right?.metriq_score?.components && typeof right.metriq_score.components === "object"
    ? right.metriq_score.components as Record<string, any>
    : {};
  const names = Array.from(new Set([...Object.keys(leftComponents), ...Object.keys(rightComponents)]));
  names.sort((a, b) => {
    const weightA = Math.max(
      toFiniteComparisonNumber(leftComponents[a]?.weight) ?? Number.NEGATIVE_INFINITY,
      toFiniteComparisonNumber(rightComponents[a]?.weight) ?? Number.NEGATIVE_INFINITY,
    );
    const weightB = Math.max(
      toFiniteComparisonNumber(leftComponents[b]?.weight) ?? Number.NEGATIVE_INFINITY,
      toFiniteComparisonNumber(rightComponents[b]?.weight) ?? Number.NEGATIVE_INFINITY,
    );
    if (weightA !== weightB) return weightB - weightA;
    return a.localeCompare(b);
  });

  return names.map((name) => {
    const leftComponent = leftComponents[name] || {};
    const rightComponent = rightComponents[name] || {};
    return {
      name,
      weight: getComponentWeight(leftComponent, rightComponent),
      leftRaw: formatMetricValue(leftComponent?.raw),
      rightRaw: formatMetricValue(rightComponent?.raw),
      leftNormalized: formatComparisonNumber(leftComponent?.normalized, 3),
      rightNormalized: formatComparisonNumber(rightComponent?.normalized, 3),
      normalizedDelta: formatSignedDifference(leftComponent?.normalized, rightComponent?.normalized, 3),
      leftTimestamp: getComponentTimestamp(leftComponent),
      rightTimestamp: getComponentTimestamp(rightComponent),
    };
  });
}

function isMetadataComparable(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.every((item) => typeof item !== "object" || item === null);
  return typeof value !== "object";
}

function buildMetadataRows(left: PlatformDetail, right: PlatformDetail): MetadataRow[] {
  const leftMetadata = getPlatformMetadata(left);
  const rightMetadata = getPlatformMetadata(right);
  const excluded = new Set(["num_qubits", "max_qubits", "qubits", "width"]);
  return Array.from(new Set([...Object.keys(leftMetadata), ...Object.keys(rightMetadata)]))
    .filter((key) => !excluded.has(key))
    .filter((key) => isMetadataComparable(leftMetadata[key]) && isMetadataComparable(rightMetadata[key]))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      label: key,
      left: formatDisplayValue(leftMetadata[key]),
      right: formatDisplayValue(rightMetadata[key]),
    }));
}

function buildPlatformComparison(left: PlatformDetail, right: PlatformDetail) {
  const leftScore = toFiniteComparisonNumber(left?.metriq_score?.value);
  const rightScore = toFiniteComparisonNumber(right?.metriq_score?.value);
  const leftQubits = extractNumQubits(left);
  const rightQubits = extractNumQubits(right);
  const leftCoverage = getCoverageValue(left);
  const rightCoverage = getCoverageValue(right);
  const leftRuns = getPlatformRunsCount(left);
  const rightRuns = getPlatformRunsCount(right);

  const overviewRows: OverviewRow[] = [
    {
      label: "Metriq Score",
      left: formatComparisonNumber(leftScore, 2),
      right: formatComparisonNumber(rightScore, 2),
      delta: formatSignedDifference(leftScore, rightScore, 2),
    },
    {
      label: "Qubits",
      left: formatComparisonInteger(leftQubits),
      right: formatComparisonInteger(rightQubits),
      delta: formatSignedDifference(leftQubits, rightQubits, 0),
    },
    {
      label: "Coverage",
      left: formatComparisonPercent(leftCoverage),
      right: formatComparisonPercent(rightCoverage),
      delta: formatSignedPercentDifference(leftCoverage, rightCoverage),
    },
    {
      label: "Runs",
      left: formatComparisonInteger(leftRuns),
      right: formatComparisonInteger(rightRuns),
      delta: formatSignedDifference(leftRuns, rightRuns, 0),
    },
    {
      label: "First Seen",
      left: formatDateOnlyValue(left?.first_seen),
      right: formatDateOnlyValue(right?.first_seen),
    },
    {
      label: "Last Seen",
      left: formatDateOnlyValue(left?.last_seen),
      right: formatDateOnlyValue(right?.last_seen),
    },
  ];

  const leftProvider = getPlatformProvider(left);
  const rightProvider = getPlatformProvider(right);
  const leftDevice = getPlatformDevice(left);
  const rightDevice = getPlatformDevice(right);

  return {
    left: {
      provider: leftProvider,
      device: leftDevice,
      label: `${leftProvider} · ${leftDevice}`,
    },
    right: {
      provider: rightProvider,
      device: rightDevice,
      label: `${rightProvider} · ${rightDevice}`,
    },
    sameProvider: leftProvider.trim().toLowerCase() === rightProvider.trim().toLowerCase(),
    overviewRows,
    componentRows: buildComponentRows(left, right),
    metadataRows: buildMetadataRows(left, right),
  };
}

(globalThis as any).MetriqPlatformCompare = {
  buildPlatformComparison,
  formatSignedDifference,
};
})();
