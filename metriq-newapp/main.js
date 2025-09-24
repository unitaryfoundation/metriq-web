const BENCHMARKS_FALLBACK = [
  {
    provider: 'ProviderX',
    device: 'Helios-1',
    benchmark: 'Task1',
    timestamp: '2024-01-05T10:15:00Z',
    metrics: { accuracy: 72.1, latency_ms: 128 },
    errors: { accuracy: 1.8, latency_ms: 6 }
  },
  {
    provider: 'ProviderX',
    device: 'Helios-2',
    benchmark: 'Task1',
    timestamp: '2024-01-19T14:20:00Z',
    metrics: { accuracy: 74.6, latency_ms: 110 },
    errors: { accuracy: 1.2, latency_ms: 5 }
  },
  {
    provider: 'ProviderY',
    device: 'Aquila-3',
    benchmark: 'Task2',
    timestamp: '2024-02-02T09:05:00Z',
    metrics: { accuracy: 68.4, energy_kwh: 42.3 },
    errors: { accuracy: 2.6, energy_kwh: 1.7 }
  },
  {
    provider: 'ProviderY',
    device: 'Aquila-4',
    benchmark: 'Task2',
    timestamp: '2024-03-12T18:45:00Z',
    metrics: { accuracy: 80.9, energy_kwh: 38.1 },
    errors: { accuracy: 1.4, energy_kwh: 1.1 }
  },
  {
    provider: 'ProviderZ',
    device: 'Orion-5',
    benchmark: 'Task3',
    timestamp: '2024-03-28T07:30:00Z',
    metrics: { fidelity: 0.955, shots: 1024 },
    errors: { fidelity: 0.012, shots: 48 }
  }
];

// ---- Config ----
const DEFAULT_EMBED_URL = "https://example.com/public-view"; 
const CONFIG_PATH = "./data/config.json";
// <-- override with ?src= to bypass the generated Metabase embed URL
const METABASE_EMBED_JSON = "./data/metabase-embed.json";

// ---- Elements ----
const iframe = document.getElementById("embed");
const skeleton = document.getElementById("skeleton");
const reloadBtn = document.getElementById("btn-reload");
const openMetabaseBtn = document.getElementById("btn-open-metabase");
const searchInput = document.getElementById("benchmark-search");
const searchTrigger = document.getElementById("search-trigger");
const searchDatalist = document.getElementById("benchmark-options");
const detailModal = document.getElementById("detail-modal");
const detailTitle = document.getElementById("detail-title");
const detailSubtitle = document.getElementById("detail-subtitle");
const detailBody = document.getElementById("detail-body");
const detailCloseBtn = detailModal?.querySelector('.detail-modal__close');

// Tabs
const tabGraph = document.getElementById("tab-graph");
const tabTable = document.getElementById("tab-table");
const panelGraph = document.getElementById("panel-graph");
const panelTable = document.getElementById("panel-table");
const chartTitleEl = panelGraph?.querySelector('.panel__title');

const filterProvider = document.getElementById("filter-provider");
const filterBenchmark = document.getElementById("filter-benchmark");
const filterDevice = document.getElementById("filter-device");
const metricSelect = document.getElementById("filter-metric");
const resetFiltersBtn = document.getElementById("filter-reset");

const filterElements = {
  benchmark: filterBenchmark,
  provider: filterProvider,
  device: filterDevice,
};

const filterState = {
  provider: "all",
  benchmark: "all",
  device: "all",
};

let allMetricDefs = [];
let currentMetricId = null;

let appConfigPromise;
let appConfigCache = null;
let benchmarksPromise;
let rawBenchmarks = [];
let chartView = null;
let resizeHandler = null;
let filtersInitialized = false;
let renderSequence = 0;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function activateTab(which) {
  const graphActive = which === "graph";
  tabGraph.classList.toggle("is-active", graphActive);
  tabGraph.setAttribute("aria-selected", String(graphActive));
  tabTable.classList.toggle("is-active", !graphActive);
  tabTable.setAttribute("aria-selected", String(!graphActive));
  panelGraph.classList.toggle("is-active", graphActive);
  panelTable.classList.toggle("is-active", !graphActive);
}

tabGraph?.addEventListener("click", () => activateTab("graph"));
tabTable?.addEventListener("click", () => activateTab("table"));

// ---- Iframe wiring ----
const params = new URLSearchParams(location.search);
const srcParam = params.get("src");
let embedBaseSrc = srcParam || DEFAULT_EMBED_URL;
let benchmarkPages = [];

async function resolveMetabaseEmbedUrl() {
  try {
    const resp = await fetch(METABASE_EMBED_JSON, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = await resp.json();
    const url = data?.iframeUrl?.trim?.();
    return url ? url : null;
  } catch (err) {
    console.warn("[embed] failed to load metabase embed:", err);
    return null;
  }
}

function applyEmbedSource(url) {
  embedBaseSrc = url;
  if (!iframe) return;
  if (skeleton) skeleton.style.display = "block";
  iframe.src = url;
}

if (iframe) {
  iframe.addEventListener("load", () => {
    if (skeleton) skeleton.style.display = "none";
  });
}

if (reloadBtn) {
  reloadBtn.addEventListener("click", () => {
    if (!embedBaseSrc) return;
    applyEmbedSource(embedBaseSrc);
  });
}

if (openMetabaseBtn) {
  openMetabaseBtn.addEventListener('click', async () => {
    try {
      const config = appConfigCache || await loadAppConfig();
      const targetUrl = config?.metabaseExploreUrl || config?.metabaseEmbedUrl || embedBaseSrc || DEFAULT_EMBED_URL;
      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener');
      }
    } catch (err) {
      console.warn('[metabase] unable to open external table:', err);
    }
  });
}

(async () => {
  const config = await loadAppConfig();
  setupBenchmarkSearch(config);
  let initial = srcParam;
  if (!initial) {
    const generated = await resolveMetabaseEmbedUrl();
    initial = generated || config.metabaseEmbedUrl || DEFAULT_EMBED_URL;
  }
  applyEmbedSource(initial);
})();

async function loadBenchmarks() {
  if (!benchmarksPromise) {
    benchmarksPromise = (async () => {
      const config = await loadAppConfig();
      const url = config.benchmarksUrl || './data/benchmarks.json';
      try {
        const requestUrl = appendCacheBust(url);
        const resp = await fetch(requestUrl, { cache: 'no-store' });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} loading ${url}`);
        }
        const json = await resp.json();
        if (Array.isArray(json)) {
          return json.map(normalizeRun);
        }
        console.warn('[chart] data/benchmarks.json did not return an array, using fallback.');
      } catch (fetchErr) {
        console.warn('[chart] fetch failed, using inline fallback dataset:', fetchErr);
      }
      return BENCHMARKS_FALLBACK.map(normalizeRun);
    })();
  }
  return benchmarksPromise;
}

function normalizeRun(run) {
  const clone = { ...run };
  clone.provider = clone.provider ?? 'Unknown';
  clone.device = clone.device ?? 'Unknown';
  clone.benchmark = clone.benchmark ?? 'Unknown';
  const metrics = { ...clone.metrics } && typeof clone.metrics === 'object' ? { ...clone.metrics } : {};
  const errors = { ...clone.errors } && typeof clone.errors === 'object' ? { ...clone.errors } : {};
  if (clone.accuracy !== undefined && metrics.accuracy === undefined) {
    const val = Number(clone.accuracy);
    if (Number.isFinite(val)) metrics.accuracy = val;
  }
  Object.keys(metrics).forEach(key => {
    const num = Number(metrics[key]);
    if (!Number.isFinite(num)) {
      delete metrics[key];
    } else {
      metrics[key] = num;
    }
  });
  clone.metrics = metrics;
  Object.keys(errors).forEach(key => {
    const num = Number(errors[key]);
    if (!Number.isFinite(num) || num < 0) {
      delete errors[key];
    } else {
      errors[key] = num;
    }
  });
  clone.errors = errors;
  return clone;
}

function loadAppConfig() {
  if (!appConfigPromise) {
    appConfigPromise = (async () => {
      try {
        const resp = await fetch(CONFIG_PATH, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const cfg = await resp.json();
        appConfigCache = cfg && typeof cfg === 'object' ? cfg : {};
        return appConfigCache;
      } catch (err) {
        console.warn('[config] failed to load config.json, using defaults:', err);
        appConfigCache = {};
        return appConfigCache;
      }
    })();
  }
  return appConfigPromise;
}

function appendCacheBust(url) {
  const bust = `_=${Date.now()}`;
  if (url.includes('?')) {
    return `${url}&${bust}`;
  }
  return `${url}?${bust}`;
}

function setupBenchmarkSearch(config) {
  benchmarkPages = Array.isArray(config.benchmarkPages)
    ? config.benchmarkPages
        .map(page => {
          if (!page) return null;
          const label = String(page.label ?? '').trim();
          const url = String(page.url ?? '').trim();
          if (!label || !url) return null;
          return { label, url, lower: label.toLowerCase() };
        })
        .filter(Boolean)
    : [];

  if (searchDatalist) {
    searchDatalist.innerHTML = '';
    benchmarkPages.forEach(page => {
      const option = document.createElement('option');
      option.value = page.label;
      searchDatalist.appendChild(option);
    });
  }

  const hasPages = benchmarkPages.length > 0;
  if (searchInput) {
    searchInput.disabled = !hasPages;
    if (!hasPages) searchInput.value = '';
  }
  if (searchTrigger) {
    searchTrigger.disabled = !hasPages;
  }
}

function resolveBenchmarkUrl(query) {
  if (!benchmarkPages.length) return null;
  if (!query) return benchmarkPages[0].url;
  const lower = query.toLowerCase();
  const exact = benchmarkPages.find(page => page.lower === lower);
  if (exact) return exact.url;
  const partial = benchmarkPages.find(page => page.lower.includes(lower));
  if (partial) return partial.url;
  return null;
}

function openBenchmark(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

if (searchTrigger) {
  searchTrigger.addEventListener('click', () => {
    console.info('[search] search triggered (link handling disabled)');
  });
}

if (searchInput) {
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      console.info('[search] enter pressed (link handling disabled)');
    }
  });
}

if (metricSelect) {
  metricSelect.addEventListener('change', () => {
    currentMetricId = metricSelect.value;
    drawChart();
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeDetail();
  }
});

if (detailModal) {
  detailModal.addEventListener('click', event => {
    if (event.target === detailModal || event.target.hasAttribute('data-detail-close')) {
      closeDetail();
    }
  });
}

if (detailCloseBtn) {
  detailCloseBtn.addEventListener('click', () => closeDetail());
}

function uniqueValues(values, key) {
  const seen = new Set();
  values.forEach(item => {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== "") {
      seen.add(String(value));
    }
  });
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function populateSelect(select, options, label, key) {
  if (!select) return;
  const current = filterState[key] ?? "all";
  const fragment = document.createDocumentFragment();
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = label;
  fragment.appendChild(allOption);
  options.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    fragment.appendChild(option);
  });
  select.innerHTML = "";
  select.appendChild(fragment);
  const nextValue = options.includes(current) ? current : "all";
  select.value = nextValue;
  filterState[key] = nextValue;
}

function populateFilterOptions(values) {
  populateSelect(filterBenchmark, uniqueValues(values, "benchmark"), "All benchmarks", "benchmark");
  populateSelect(filterProvider, uniqueValues(values, "provider"), "All providers", "provider");
  populateSelect(filterDevice, uniqueValues(values, "device"), "All devices", "device");
}

function setupMetrics(values, config) {
  allMetricDefs = buildMetricDefs(values, config);
  if (!allMetricDefs.length) {
    allMetricDefs = [{ id: 'accuracy', label: 'Accuracy', unit: '', scale: 'linear', format: null, description: '' }];
  }
  if (!currentMetricId || !allMetricDefs.find(def => def.id === currentMetricId)) {
    currentMetricId = allMetricDefs[0].id;
  }
}

function buildMetricDefs(values, config) {
  const defs = new Map();
  const fromConfig = Array.isArray(config?.metrics) ? config.metrics : [];
  fromConfig.forEach(def => {
    if (!def || !def.id) return;
    const id = String(def.id);
    defs.set(id, {
      id,
      label: def.label || id,
      unit: def.unit ? String(def.unit) : '',
      scale: def.scale === 'log' ? 'log' : 'linear',
      format: def.format || null,
      description: def.description || ''
    });
  });
  values.forEach(run => {
    const metrics = run.metrics || {};
    Object.keys(metrics).forEach(key => {
      if (!defs.has(key)) {
        defs.set(key, { id: key, label: key, unit: '', scale: 'linear', format: null, description: '' });
      }
    });
  });
  return Array.from(defs.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function collectMetricIdsWithValues(runs) {
  const ids = new Set();
  runs.forEach(run => {
    const metrics = run.metrics || {};
    Object.entries(metrics).forEach(([key, value]) => {
      if (Number.isFinite(Number(value))) {
        ids.add(key);
      }
    });
  });
  return ids;
}

function refreshMetricOptions(runs) {
  let visibleDefs = allMetricDefs;
  const restrictToBenchmark = filterState.benchmark !== 'all' && runs.length;
  if (restrictToBenchmark) {
    const availableIds = collectMetricIdsWithValues(runs);
    visibleDefs = allMetricDefs.filter(def => availableIds.has(def.id));
    if (!visibleDefs.length) {
      visibleDefs = allMetricDefs;
    }
  }

  if (!visibleDefs.length) {
    return [];
  }

  if (!visibleDefs.find(def => def.id === currentMetricId)) {
    currentMetricId = visibleDefs[0].id;
  }

  if (metricSelect) {
    const fragment = document.createDocumentFragment();
    visibleDefs.forEach(def => {
      const option = document.createElement('option');
      option.value = def.id;
      option.textContent = def.unit ? `${def.label} (${def.unit})` : def.label;
      fragment.appendChild(option);
    });
    metricSelect.innerHTML = '';
    metricSelect.appendChild(fragment);
    metricSelect.value = currentMetricId;
    metricSelect.disabled = visibleDefs.length <= 1;
  }

  return visibleDefs;
}

function getActiveMetric() {
  return allMetricDefs.find(def => def.id === currentMetricId) || allMetricDefs[0];
}

function buildMetricLabel(metric) {
  if (!metric) return 'Metric';
  return metric.unit ? `${metric.label} (${metric.unit})` : metric.label;
}

function updateChartHeading(metric) {
  if (chartTitleEl) {
    chartTitleEl.textContent = `${buildMetricLabel(metric)} over time`;
  }
}

function getMetricValue(run, metricId) {
  const metrics = run.metrics || {};
  const value = Number(metrics[metricId]);
  return Number.isFinite(value) ? value : null;
}

function getMetricError(run, metricId) {
  const errors = run.errors || {};
  const value = Number(errors[metricId]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function setupFilters(values) {
  populateFilterOptions(values);
  if (filtersInitialized) return;
  Object.entries(filterElements).forEach(([key, select]) => {
    if (!select) return;
    select.addEventListener("change", () => {
      filterState[key] = select.value;
      drawChart();
    });
  });
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      Object.entries(filterElements).forEach(([key, select]) => {
        if (select) {
          select.value = "all";
          filterState[key] = "all";
        }
      });
      if (allMetricDefs.length) {
        currentMetricId = allMetricDefs[0].id;
        if (metricSelect) {
          metricSelect.value = currentMetricId;
        }
      }
      drawChart();
    });
  }
  filtersInitialized = true;
}

function refreshDeviceOptions() {
  if (!filterDevice) return;
  const runs = getFilteredData({ includeDevice: false });
  const devices = uniqueValues(runs, 'device');
  populateSelect(filterDevice, devices, 'All devices', 'device');
}

function getFilteredData(options = {}) {
  const { includeDevice = true } = options;
  return rawBenchmarks.filter(item => {
    if (filterState.provider !== "all" && item.provider !== filterState.provider) return false;
    if (filterState.benchmark !== "all" && item.benchmark !== filterState.benchmark) return false;
    if (includeDevice && filterState.device !== "all" && item.device !== filterState.device) return false;
    return true;
  });
}
function openRunDetail(run) {
  if (!detailModal || !detailTitle || !detailBody || !detailSubtitle) return;
  if (!run) return;
  const metric = getActiveMetric();
  const metricLabel = metric.unit ? `${metric.label} (${metric.unit})` : metric.label;
  const metricFormat = metric.format || '.3f';
  const providerRuns = rawBenchmarks.filter(item => item.provider === run.provider);
  const deviceRuns = rawBenchmarks.filter(item => item.device === run.device);
  const providerStats = summarizeMetric(providerRuns, metric.id);
  const deviceStats = summarizeMetric(deviceRuns, metric.id);
  const providerList = buildRunList(providerRuns, metric, 5, false);
  const deviceList = buildRunList(deviceRuns, metric, 5, true);
  const runMetricValue = getMetricValue(run, metric.id);
  const runMetric = formatMetricValue(runMetricValue, metricFormat, metric.unit);
  const runError = getMetricError(run, metric.id);
  const runMetricWithError = runError !== null
    ? `${runMetric} ± ${formatMetricValue(runError, metricFormat, metric.unit)}`
    : runMetric;

  detailTitle.textContent = `${run.provider} · ${run.device}`;
  detailSubtitle.textContent = `${run.benchmark} · ${runMetricWithError} · ${formatTimestamp(run.timestamp)}`;
  detailBody.innerHTML = `
    <section class="detail-section">
      <h5>Provider insight</h5>
      <div class="detail-pillrow">
        <span class="detail-pill">${providerRuns.length} run${providerRuns.length === 1 ? '' : 's'}</span>
        <span class="detail-pill">Avg ${formatMetricValue(providerStats?.average, metricFormat, metric.unit)}</span>
        <span class="detail-pill">Max ${formatMetricValue(providerStats?.max, metricFormat, metric.unit)}</span>
      </div>
      <ul>${providerList || '<li>No additional runs</li>'}</ul>
    </section>
    <section class="detail-section">
      <h5>Device insight</h5>
      <div class="detail-pillrow">
        <span class="detail-pill">${deviceRuns.length} run${deviceRuns.length === 1 ? '' : 's'}</span>
        <span class="detail-pill">Avg ${formatMetricValue(deviceStats?.average, metricFormat, metric.unit)}</span>
        <span class="detail-pill">Max ${formatMetricValue(deviceStats?.max, metricFormat, metric.unit)}</span>
      </div>
      <ul>${deviceList || '<li>No additional runs</li>'}</ul>
    </section>
  `;
  detailModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  if (!detailModal || detailModal.hidden) return;
  detailModal.hidden = true;
  document.body.style.overflow = '';
}

function summarizeMetric(runs, metricId) {
  const values = runs.map(run => getMetricValue(run, metricId)).filter(value => value !== null);
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    average: sum / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function formatMetricValue(value, format, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  let formatted;
  if (typeof format === 'string') {
    const match = format.match(/^\.([0-9]+)f$/);
    if (match) {
      const digits = Number(match[1]);
      formatted = Number(value).toFixed(digits);
    } else {
      formatted = Number(value).toLocaleString();
    }
  } else {
    formatted = Number(value).toLocaleString();
  }
  return unit ? `${formatted} ${unit}`.trim() : formatted;
}

function buildRunList(runs, metric, limit, includeBenchmark) {
  const format = metric.format || '.3f';
  return runs
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .map(entry => {
      const value = formatMetricValue(getMetricValue(entry, metric.id), format, metric.unit);
      const err = getMetricError(entry, metric.id);
      const display = err !== null
        ? `${value} ± ${formatMetricValue(err, format, metric.unit)}`
        : value;
      const label = includeBenchmark ? entry.benchmark : entry.device;
      return `<li>${formatTimestamp(entry.timestamp)} · ${label} · ${display}</li>`;
    })
    .join('');
}

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

async function renderChart(values, token, metric) {
  const el = document.getElementById("chart");
  const skeletonGraph = document.getElementById("skeleton-graph");
  if (!el) {
    console.error('[chart] #chart element not found');
    return;
  }

  if (skeletonGraph) skeletonGraph.style.display = "block";

  const embed = globalThis.vegaEmbed;
  if (typeof embed !== "function") {
    console.error('[chart] vegaEmbed is undefined — are the Vega scripts loaded?');
    if (skeletonGraph) skeletonGraph.style.display = "none";
    return;
  }

  if (token !== renderSequence) {
    return;
  }

  if (!values.length) {
    if (token !== renderSequence) return;
    if (chartView) {
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
      chartView.finalize();
      chartView = null;
    }
    el.innerHTML = '<div class="chart-empty">No benchmarks match the current filters.</div>';
    if (skeletonGraph) skeletonGraph.style.display = "none";
    return;
  }

  if (chartView) {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    chartView.finalize();
    chartView = null;
  }
  el.innerHTML = "";

  const metricLabel = buildMetricLabel(metric);
  const scaleType = metric?.scale === 'log' ? 'log' : 'linear';
  const tooltipFormat = typeof metric?.format === 'string' ? metric.format : undefined;
  const yScale = { type: scaleType, zero: scaleType === 'linear' };
  const transform = metric?.scale === 'log'
    ? [{ filter: 'datum.metricValue > 0' }]
    : [];
  const selectionName = `providerFilter_${token}`;
  const providerOpacity = {
    condition: { selection: selectionName, value: 1 },
    value: 0.18
  };

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: `${metricLabel} over time`,
    width: 'container',
    height: 420,
    autosize: { type: 'fit', contains: 'padding' },
    data: { values },
    transform,
    encoding: {
      x: { field: 'timestamp', type: 'temporal', title: 'Run timestamp' },
      color: { field: 'provider', type: 'nominal', legend: { title: 'Provider' } },
      detail: { field: 'benchmark' }
    },
    layer: [
      {
        mark: { type: 'rule', strokeWidth: 1.5, strokeOpacity: 0.5 },
        encoding: {
          y: {
            field: 'metricLower',
            type: 'quantitative',
            title: metricLabel,
            scale: yScale
          },
          y2: { field: 'metricUpper' }
        }
      },
      {
        mark: { type: 'tick', orient: 'horizontal', size: 12, thickness: 1.5, opacity: 0.6 },
        encoding: {
          y: {
            field: 'metricLower',
            type: 'quantitative',
            scale: yScale
          }
        }
      },
      {
        mark: { type: 'tick', orient: 'horizontal', size: 12, thickness: 1.5, opacity: 0.6 },
        encoding: {
          y: {
            field: 'metricUpper',
            type: 'quantitative',
            scale: yScale
          }
        }
      },
      {
        mark: { type: 'line', interpolate: 'monotone', point: false, opacity: 0.35 },
        encoding: {
          y: {
            field: 'metricValue',
            type: 'quantitative',
            title: metricLabel,
            scale: yScale
          }
        }
      },
      {
        mark: { type: 'point', filled: true, size: 70, opacity: 0.9 },
        selection: {
          [selectionName]: { type: 'multi', fields: ['provider'], bind: 'legend' }
        },
        encoding: {
          y: {
            field: 'metricValue',
            type: 'quantitative',
            title: metricLabel,
            scale: yScale
          },
          shape: { field: 'benchmark', type: 'nominal', legend: { title: 'Benchmark' } },
          tooltip: [
            { field: 'device', title: 'Device' },
            { field: 'provider', title: 'Provider' },
            { field: 'benchmark', title: 'Benchmark' },
            {
              field: 'metricValue',
              title: metricLabel,
              type: 'quantitative',
              format: tooltipFormat
            },
            {
              field: 'metricError',
              title: 'Error',
              type: 'quantitative',
              format: tooltipFormat
            },
            { field: 'timestamp', title: 'Timestamp', type: 'temporal', format: '%Y-%m-%d %H:%M' }
          ],
          opacity: providerOpacity
        }
      }
    ]
  };

  try {
    const { view } = await embed(el, spec, { actions: false, renderer: 'canvas' });
    if (token !== renderSequence) {
      view.finalize();
      return;
    }
    chartView = view;
    console.info('[chart] rendering Vega view with', values.length, 'rows');
    resizeHandler = () => {
      if (chartView) {
        chartView.resize().run();
      }
    };
    resizeHandler();
    window.addEventListener('resize', resizeHandler, { passive: true });
    view.addEventListener('click', (event, item) => {
      if (item && item.datum) {
        openRunDetail(item.datum);
      }
    });
  } catch (err) {
    if (token !== renderSequence) return;
    console.error('[chart] render failed:', err);
    el.innerHTML = '<div style="padding:12px;color:#f88">Failed to load chart data. Check the console for details.</div>';
  } finally {
    if (token === renderSequence && skeletonGraph) {
      skeletonGraph.style.display = 'none';
    }
  }
}

async function drawChart() {
  const token = ++renderSequence;
  refreshDeviceOptions();
  const filtered = getFilteredData();
  const availableMetricDefs = refreshMetricOptions(filtered);
  if (!availableMetricDefs.length) {
    return;
  }
  const metric = getActiveMetric();
  updateChartHeading(metric);
  const chartValues = filtered
    .map(run => {
      const metricValue = getMetricValue(run, metric.id);
      if (metricValue === null) return null;
      if (metric.scale === 'log' && metricValue <= 0) return null;
      const metricError = getMetricError(run, metric.id);
      let metricLower = null;
      let metricUpper = null;
      if (metricError !== null) {
        metricLower = metricValue - metricError;
        metricUpper = metricValue + metricError;
        if (metric.scale === 'log' && (metricLower <= 0 || metricUpper <= 0)) {
          metricLower = null;
          metricUpper = null;
        }
      }
      return { ...run, metricValue, metricError, metricLower, metricUpper };
    })
    .filter(Boolean);
  await renderChart(chartValues, token, metric);
}

async function initBenchmarksView() {
  const el = document.getElementById('chart');
  const skeletonGraph = document.getElementById('skeleton-graph');
  try {
    const [config, data] = await Promise.all([loadAppConfig(), loadBenchmarks()]);
    rawBenchmarks = Array.isArray(data) ? data : [];
    if (!rawBenchmarks.length) {
      if (el) {
        el.innerHTML = '<div class="chart-empty">No benchmark data available.</div>';
      }
      if (skeletonGraph) skeletonGraph.style.display = 'none';
      return;
    }
    setupMetrics(rawBenchmarks, config);
    setupFilters(rawBenchmarks);
    refreshMetricOptions(rawBenchmarks);
    await drawChart();
  } catch (err) {
    console.error('[chart] initialization failed:', err);
    if (el) {
      el.innerHTML = '<div style="padding:12px;color:#f88">Unable to load chart data.</div>';
    }
    if (skeletonGraph) skeletonGraph.style.display = 'none';
  }
}

initBenchmarksView();

async function injectFooter() {
  const slot = document.getElementById('footer-slot');
  if (!slot) return;
  try {
    const resp = await fetch('./footer.html', { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} loading footer.html`);
    const markup = await resp.text();
    slot.innerHTML = markup;
    const yearEl = slot.querySelector('#footer-year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  } catch (err) {
    console.warn('[footer] load failed:', err);
    slot.innerHTML = '<footer class="site-footer"><div class="footer-inner"><small>Metriq — footer unavailable.</small></div></footer>';
  }
}

injectFooter();
