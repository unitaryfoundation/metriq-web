import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
require("./platformCompare.js");

const { buildPlatformComparison, formatSignedDifference } =
  globalThis.MetriqPlatformCompare;

const leftPlatform = {
  provider: "Acme Quantum",
  device: "Falcon",
  runs: [{ id: 1 }, { id: 2 }],
  first_seen: "2025-01-01T00:00:00Z",
  last_seen: "2025-05-01T00:00:00Z",
  current: {
    device_metadata: {
      num_qubits: 72,
      status: "online",
      processor_type: "superconducting",
      basis_gates: ["x", "rz"],
    },
  },
  metriq_score: {
    value: 61.25,
    coverage: 0.64,
    components: {
      fidelity: {
        weight: 0.4,
        raw: 0.99123,
        normalized: 0.81,
        timestamp: "2025-05-01T00:00:00Z",
      },
      depth: {
        weight: 0.2,
        raw: 310,
        normalized: 0.42,
        timestamp: "2025-04-01T00:00:00Z",
      },
    },
  },
};

const rightPlatform = {
  provider: "Acme Quantum",
  device: "Hawk",
  runs: [{ id: 3 }],
  first_seen: "2025-02-01T00:00:00Z",
  last_seen: "2025-06-01T00:00:00Z",
  current: {
    device_metadata: {
      num_qubits: 100,
      status: "calibration",
      processor_type: "superconducting",
      basis_gates: ["x", "sx", "rz"],
    },
  },
  metriq_score: {
    value: 56,
    coverage: 0.5,
    components: {
      fidelity: {
        weight: 0.4,
        raw: 0.95234,
        normalized: 0.6,
        timestamp: "2025-06-01T00:00:00Z",
      },
      crosstalk: {
        weight: 0.1,
        raw: null,
        normalized: null,
        timestamp: null,
      },
    },
  },
};

test("formats signed differences without winner language", () => {
  assert.equal(formatSignedDifference(61.25, 56, 2), "+5.25");
  assert.equal(formatSignedDifference(72, 100, 0), "-28");
  assert.equal(formatSignedDifference(null, 100, 0), "—");
});

test("builds overview rows for a same-provider device comparison", () => {
  const comparison = buildPlatformComparison(leftPlatform, rightPlatform);

  assert.equal(comparison.left.label, "Acme Quantum · Falcon");
  assert.equal(comparison.right.label, "Acme Quantum · Hawk");
  assert.deepEqual(comparison.sameProvider, true);

  const score = comparison.overviewRows.find((row) => row.label === "Metriq Score");
  assert.deepEqual(score, {
    label: "Metriq Score",
    left: "61.25",
    right: "56.00",
    delta: "+5.25",
  });

  const qubits = comparison.overviewRows.find((row) => row.label === "Qubits");
  assert.deepEqual(qubits, {
    label: "Qubits",
    left: "72",
    right: "100",
    delta: "-28",
  });
});

test("aligns score components and metadata fields by name", () => {
  const comparison = buildPlatformComparison(leftPlatform, rightPlatform);

  assert.deepEqual(
    comparison.componentRows.map((row) => row.name),
    ["fidelity", "depth", "crosstalk"],
  );

  assert.deepEqual(comparison.componentRows[0], {
    name: "fidelity",
    weight: "0.40",
    leftRaw: "0.991",
    rightRaw: "0.952",
    leftNormalized: "0.810",
    rightNormalized: "0.600",
    normalizedDelta: "+0.210",
    leftTimestamp: "2025-05-01",
    rightTimestamp: "2025-06-01",
  });

  assert.deepEqual(comparison.metadataRows, [
    {
      label: "basis_gates",
      left: "x, rz",
      right: "x, sx, rz",
    },
    {
      label: "processor_type",
      left: "superconducting",
      right: "superconducting",
    },
    {
      label: "status",
      left: "online",
      right: "calibration",
    },
  ]);
});
