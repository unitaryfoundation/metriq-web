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

// ---- Elements ---- (typed for TS)
const iframe = document.getElementById("embed") as HTMLIFrameElement | null;
const skeleton = document.getElementById("skeleton") as HTMLElement | null;
const reloadBtn = document.getElementById("btn-reload") as HTMLButtonElement | null;
const openMetabaseBtn = document.getElementById("btn-open-metabase") as HTMLButtonElement | null;
const searchInput = document.getElementById("benchmark-search") as HTMLInputElement | null;
const searchTrigger = document.getElementById("search-trigger") as HTMLButtonElement | null;
const searchDatalist = document.getElementById("benchmark-options") as HTMLDataListElement | null;
const detailModal = document.getElementById("detail-modal") as HTMLElement | null;
const detailTitle = document.getElementById("detail-title") as HTMLElement | null;
const detailSubtitle = document.getElementById("detail-subtitle") as HTMLElement | null;
const detailBody = document.getElementById("detail-body") as HTMLElement | null;
const detailCloseBtn = (detailModal?.querySelector('.detail-modal__close') as HTMLButtonElement | null) || null;

// Top-level views
const viewResultsBtn = document.getElementById('view-results-btn') as HTMLButtonElement | null;
const viewPlatformsBtn = document.getElementById('view-platforms-btn') as HTMLButtonElement | null;
const viewBenchmarksBtn = document.getElementById('view-benchmarks-btn') as HTMLButtonElement | null;
const viewResults = document.getElementById('view-results') as HTMLElement | null;
const viewPlatforms = document.getElementById('view-platforms') as HTMLElement | null;
const viewBenchmarks = document.getElementById('view-benchmarks') as HTMLElement | null;

// No extra filters for Platforms/Benchmarks

// Results sub-tabs
const tabGraph = document.getElementById("tab-graph") as HTMLButtonElement | null;
const tabTable = document.getElementById("tab-table") as HTMLButtonElement | null;
const panelGraph = document.getElementById("panel-graph") as HTMLElement | null;
const panelTable = document.getElementById("panel-table") as HTMLElement | null;
const chartTitleEl = (panelGraph?.querySelector('.panel__title') as HTMLElement | null) || null;

// No native <select> filters — custom multi-lists are used instead
const metricSelect = document.getElementById("filter-metric") as HTMLSelectElement | null;
const resetFiltersBtn = null as any;

// No filterElements map needed

const filterState: { provider: string[]; benchmark: string[] } = {
  provider: [],
  benchmark: [],
};

let allMetricDefs = [];
let currentMetricId = null;

let appConfigPromise;
let appConfigCache = null;
let benchmarksPromise;
let rawBenchmarks = [];
let platformsPromise;
let platformsLoaded = false;
let platformsIndexCache: any[] | null = null;
let deviceSeriesCache: Map<string, number[]> | null = null;
let benchmarkSeriesCache: Map<string, number[]> | null = null;
let suppressHashHandler = false;
let chartView = null;
let resizeHandler = null;
let filtersInitialized = false;
let renderSequence = 0;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
// Optional: baseline device name from config (highlighted in chart/table)
let baselineDevice: string | null = null;

// ---- Symbol scales shared between chart and UI ----
const PROVIDER_COLORS = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949',
  '#af7aa1','#ff9da7','#9c755f','#bab0ab',
  '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'
];
const BENCHMARK_SHAPES: string[] = [
  'circle','square','triangle-up','diamond','cross','triangle-down','triangle-left','triangle-right','star'
];
let providerColorMap: Map<string,string> = new Map();
let benchmarkShapeMap: Map<string,string> = new Map();
let multiBootstrapped = false;

function buildColorMap(items: string[]): Map<string,string> {
  const m = new Map<string,string>();
  items.forEach((name, i) => { m.set(name, PROVIDER_COLORS[i % PROVIDER_COLORS.length]); });
  return m;
}
function buildShapeMap(items: string[]): Map<string,string> {
  const m = new Map<string,string>();
  items.forEach((name, i) => { m.set(name, BENCHMARK_SHAPES[i % BENCHMARK_SHAPES.length]); });
  return m;
}

function shapeSvg(shape: string, color = 'currentColor'): string {
  // Simple 14x14 glyphs approximating Vega symbols
  const s = 14, c = 7; // size, center
  switch (shape) {
    case 'circle': return `<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="${color}"/></svg>`;
    case 'square': return `<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="${color}"/></svg>`;
    case 'diamond': return `<svg viewBox="0 0 14 14" aria-hidden="true"><polygon points="7,2 12,7 7,12 2,7" fill="${color}"/></svg>`;
    case 'cross': return `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M6 3h2v4h4v2H8v4H6V9H2V7h4z" fill="${color}"/></svg>`;
    case 'triangle-up': return `<svg viewBox="0 0 14 14" aria-hidden="true"><polygon points="7,2 12,12 2,12" fill="${color}"/></svg>`;
    case 'triangle-down': return `<svg viewBox="0 0 14 14" aria-hidden="true"><polygon points="2,2 12,2 7,12" fill="${color}"/></svg>`;
    case 'triangle-left': return `<svg viewBox="0 0 14 14" aria-hidden="true"><polygon points="12,2 12,12 2,7" fill="${color}"/></svg>`;
    case 'triangle-right': return `<svg viewBox="0 0 14 14" aria-hidden="true"><polygon points="2,2 12,7 2,12" fill="${color}"/></svg>`;
    case 'star': return `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2l1.6 3.3 3.6.5-2.6 2.5.6 3.5L7 10.5 3.8 11.8l.6-3.5L1.8 5.8l3.6-.5z" fill="${color}"/></svg>`;
    default: return `<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="${color}"/></svg>`;
  }
}

function renderMultiList(listId: string, options: string[], selected: string[], kind: 'provider'|'benchmark') {
  const el = document.getElementById(listId);
  if (!el) return;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  const selSet = new Set(selected || []);
  options.forEach(opt => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'multi-item' + (selSet.has(opt) ? ' is-selected' : '');
    let symbolHtml = '';
    if (kind === 'provider') {
      const col = providerColorMap.get(opt) || '#888';
      symbolHtml = `<span class="symbol-dot" style="background:${col}"></span>`;
    } else {
      const shape = benchmarkShapeMap.get(opt) || 'circle';
      symbolHtml = `<span class="symbol-shape">${shapeSvg(shape)}</span>`;
    }
    item.innerHTML = `${symbolHtml}<span>${escapeHtml(opt)}</span>`;
    item.addEventListener('click', () => {
      if (kind === 'provider') {
        toggleMultiSelection('provider', options, opt);
      } else {
        toggleMultiSelection('benchmark', options, opt);
      }
      renderMultiLists();
      drawChart();
    });
    frag.appendChild(item);
  });
  el.appendChild(frag);
}

function toggleMultiSelection(key: 'provider'|'benchmark', options: string[], value: string) {
  const sel = (filterState as any)[key] as string[];
  const set = new Set(sel || []);
  if (set.has(value)) set.delete(value); else set.add(value);
  (filterState as any)[key] = Array.from(set);
}

function renderMultiLists() {
  const allRuns = Array.isArray(rawBenchmarks) ? rawBenchmarks : [];
  const providers = uniqueValues(allRuns as any, 'provider');
  const benchmarks = uniqueValues(allRuns as any, 'benchmark');
  providerColorMap = buildColorMap(providers);
  benchmarkShapeMap = buildShapeMap(benchmarks);
  // On first render, bootstrap to ALL selected; preserve user choices afterwards
  if (!multiBootstrapped) {
    if (!filterState.provider || filterState.provider.length === 0) filterState.provider = providers.slice();
    if (!filterState.benchmark || filterState.benchmark.length === 0) filterState.benchmark = benchmarks.slice();
    multiBootstrapped = true;
  }
  renderMultiList('provider-list', providers, filterState.provider, 'provider');
  renderMultiList('benchmark-list', benchmarks, filterState.benchmark, 'benchmark');
  // Wire actions
  const pClear = document.getElementById('provider-clear') as HTMLButtonElement | null;
  const pAll = document.getElementById('provider-all') as HTMLButtonElement | null;
  const bClear = document.getElementById('benchmark-clear') as HTMLButtonElement | null;
  const bAll = document.getElementById('benchmark-all') as HTMLButtonElement | null;
  if (pClear) pClear.onclick = () => { filterState.provider = []; renderMultiLists(); drawChart(); };
  if (pAll) pAll.onclick = () => { filterState.provider = providers.slice(); renderMultiLists(); drawChart(); };
  if (bClear) bClear.onclick = () => { filterState.benchmark = []; renderMultiLists(); drawChart(); };
  if (bAll) bAll.onclick = () => { filterState.benchmark = benchmarks.slice(); renderMultiLists(); drawChart(); };
}

function activateTab(which) {
  const isGraph = which === "graph";
  const isTable = which === "table";
  tabGraph?.classList.toggle("is-active", isGraph);
  tabGraph?.setAttribute("aria-selected", String(isGraph));
  tabTable?.classList.toggle("is-active", isTable);
  tabTable?.setAttribute("aria-selected", String(isTable));
  panelGraph?.classList.toggle("is-active", isGraph);
  panelTable?.classList.toggle("is-active", isTable);
  if (isTable) {
    drawTable();
  }
  if (isGraph) {
    // Force a fresh draw to ensure visibility after being hidden
    drawChart();
  }
}

tabGraph?.addEventListener("click", () => activateTab("graph"));
tabTable?.addEventListener("click", () => activateTab("table"));

function activateView(which) {
  const isResults = which === 'results';
  const isPlatforms = which === 'platforms';
  const isBenchmarks = which === 'benchmarks';
  viewResultsBtn?.classList.toggle('is-active', isResults);
  viewResultsBtn?.setAttribute('aria-selected', String(isResults));
  viewPlatformsBtn?.classList.toggle('is-active', isPlatforms);
  viewPlatformsBtn?.setAttribute('aria-selected', String(isPlatforms));
  viewBenchmarksBtn?.classList.toggle('is-active', isBenchmarks);
  viewBenchmarksBtn?.setAttribute('aria-selected', String(isBenchmarks));
  if (viewResults) viewResults.hidden = !isResults;
  if (viewPlatforms) viewPlatforms.hidden = !isPlatforms;
  if (viewBenchmarks) viewBenchmarks.hidden = !isBenchmarks;
  if (isPlatforms) initPlatformsView();
  if (isBenchmarks) initBenchmarksListView();
  updateHash({ view: which });
}

viewResultsBtn?.addEventListener('click', () => activateView('results'));
viewPlatformsBtn?.addEventListener('click', () => activateView('platforms'));
viewBenchmarksBtn?.addEventListener('click', () => activateView('benchmarks'));

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
  if (iframe) (iframe as HTMLIFrameElement).src = url;
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
  // Wire data download links (force download via Blob when possible)
  const wireDownload = (selector: string, url: string, fallbackName: string, preferFallbackName: boolean = false) => {
    document.querySelectorAll<HTMLAnchorElement>(selector).forEach(a => {
      // Set href + download attribute as a fallback
      a.href = url;
      let name = fallbackName;
      if (!preferFallbackName) {
        try {
          const u = new URL(url, window.location.href);
          const base = (u.pathname.split('/').pop() || fallbackName).split('?')[0];
          if (base) name = base;
        } catch {}
      }
      a.setAttribute('download', name);
      a.removeAttribute('target');
      a.removeAttribute('rel');

      const handler = async (ev: Event) => {
        ev.preventDefault();
        try {
          const isCross = (() => {
            try {
              const u = new URL(url, window.location.href);
              return u.origin !== window.location.origin;
            } catch { return false; }
          })();
          // Try CORS fetch first; for same-origin this always works.
          const res = await fetch(url, { mode: isCross ? 'cors' : 'same-origin', credentials: 'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // If opaque due to CORS, this will throw when reading the body
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          const tmp = document.createElement('a');
          tmp.href = objectUrl;
          tmp.download = name;
          document.body.appendChild(tmp);
          tmp.click();
          setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
            tmp.remove();
          }, 0);
        } catch (err) {
          // Fallback: rely on native download attribute (may be ignored cross-origin)
          try {
            a.click();
          } catch {
            // Last resort: open in a new tab so the user can save manually
            window.open(url, '_blank', 'noopener');
          }
        }
      };
      // Avoid duplicate listeners if re-wired
      a.addEventListener('click', handler);
    });
  };

  try {
    const bUrl = (config && (config as any).benchmarksUrl) || './data/benchmarks.json';
    wireDownload('.link-benchmarks-json', bUrl, 'benchmarks.json');
  } catch {}
  try {
    const pUrl = (config && (config as any).platformsIndexUrl) || 'https://unitaryfoundation.github.io/metriq-data/platforms/index.json';
    wireDownload('.link-platforms-json', pUrl, 'platform-index.json', true);
  } catch {}
  let initial = srcParam;
  if (!initial) {
    const generated = await resolveMetabaseEmbedUrl();
    initial = generated || config.metabaseEmbedUrl || DEFAULT_EMBED_URL;
  }
  applyEmbedSource(initial);
})();

// Default to the Results view on load
activateView('results');

// ---- Hash routing for deep links ----
function parseHash(): Record<string, string> {
  const raw = location.hash.replace(/^#/, '').trim();
  const p = new URLSearchParams(raw);
  const o: Record<string, string> = {};
  p.forEach((v, k) => { o[k] = v; });
  return o;
}

function updateHash(next: Record<string, string>) {
  try {
    suppressHashHandler = true;
    const cur = parseHash();
    const merged = { ...cur, ...next };
    const p = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, v); });
    const nh = '#' + p.toString();
    if (location.hash !== nh) history.replaceState(null, '', nh);
  } finally {
    setTimeout(() => { suppressHashHandler = false; }, 0);
  }
}

async function applyHashRouting() {
  if (suppressHashHandler) return;
  const h = parseHash();
  const view = (h.view || 'results') as 'results'|'platforms'|'benchmarks';
  activateView(view);
  if (view === 'platforms' && h.provider && h.device) {
    await initPlatformsView();
    openPlatformDetail(h.provider, h.device);
  }
  if (view === 'benchmarks' && h.benchmark) {
    await initBenchmarksListView();
    openBenchmarkDetail(h.benchmark);
  }
}

window.addEventListener('hashchange', () => { applyHashRouting(); });
applyHashRouting();

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
          // Detect metriq-data ETL shape and adapt
          const looksLikeEtl = json.length > 0 && typeof json[0] === 'object' && json[0] !== null && (
            'results' in json[0] || 'params' in json[0] || 'job_type' in json[0]
          );
          const rows = looksLikeEtl ? json.map(adaptMetriqEtlRow) : json;
          return rows.map(normalizeRun);
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

async function loadPlatformsIndex() {
  if (!platformsPromise) {
    platformsPromise = (async () => {
      const config = await loadAppConfig();
      const defaultUrl = 'https://unitaryfoundation.github.io/metriq-data/platforms/index.json';
      const url = (config && (config as any).platformsIndexUrl) || defaultUrl;
      try {
        const resp = await fetch(appendCacheBust(url), { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${url}`);
        const json = await resp.json();
        if (json && Array.isArray(json.platforms)) {
          return json;
        }
        return { generated_at: null, platforms: [] };
      } catch (err) {
        console.warn('[platforms] failed to load index:', err);
        return { generated_at: null, platforms: [] };
      }
    })();
  }
  return platformsPromise;
}

function getPlatformsBaseUrl(indexUrl: string) {
  try {
    if (!indexUrl) return null;
    if (indexUrl.endsWith('/index.json')) {
      return indexUrl.slice(0, -('/index.json'.length));
    }
    return indexUrl.replace(/index\.json$/i, '');
  } catch { return null; }
}

async function openPlatformDetail(provider: string, device: string) {
  try {
    const config = await loadAppConfig();
    const indexUrl = (config && (config as any).platformsIndexUrl) || 'https://unitaryfoundation.github.io/metriq-data/platforms/index.json';
    const base = getPlatformsBaseUrl(indexUrl) || 'https://unitaryfoundation.github.io/metriq-data/platforms';
    const detailUrl = `${base}/${encodeURIComponent(provider)}/${encodeURIComponent(device)}.json`;
    const resp = await fetch(appendCacheBust(detailUrl), { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    renderPlatformDetail(json);
  } catch (err) {
    console.error('[platforms] detail load failed:', err);
    renderPlatformDetail({ provider, device, error: String(err) });
  }
}

function renderPlatformDetail(detail: any) {
  if (!detailModal || !detailTitle || !detailBody || !detailSubtitle) return;
  const provider = detail?.provider || 'Unknown';
  const device = detail?.device || 'Unknown';
  const runs = detail?.runs ?? 0;
  const lastSeen = detail?.last_seen || '';
  const firstSeen = detail?.first_seen || '';
  const currentMeta = detail?.current?.device_metadata || null;
  const history = Array.isArray(detail?.history) ? detail.history : [];
  detailTitle.textContent = `${provider} · ${device}`;
  detailSubtitle.textContent = `${runs} runs · ${firstSeen} → ${lastSeen}`;
  const metaHtml = currentMeta ? `<pre style="white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid rgba(0,0,0,.08);padding:10px;border-radius:8px">${escapeHtml(JSON.stringify(currentMeta, null, 2))}</pre>` : '<em>No current metadata</em>';
  const historyHtml = history.length ? history.map((h: any) => {
    const f = h?.first_seen || '';
    const l = h?.last_seen || '';
    const r = h?.runs ?? 0;
    return `<li><code>${f}</code> → <code>${l}</code> · <strong>${r}</strong> run${r===1?'':'s'}</li>`;
  }).join('') : '<li>No metadata history</li>';
  detailBody.innerHTML = `
    <section class="detail-section">
      <h5>Current metadata</h5>
      ${metaHtml}
    </section>
    <section class="detail-section">
      <h5>Metadata history</h5>
      <ul>${historyHtml}</ul>
    </section>
  `;
  detailModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"]|'/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'} as any)[c] || c);
}

async function initPlatformsView() {
  if (platformsLoaded) return;
  const container = document.getElementById('platforms-container');
  if (!container) return;
  container.innerHTML = '<div class="meta">Loading platforms…</div>';
  try {
    const data = await loadPlatformsIndex();
    const platforms = Array.isArray((data as any).platforms) ? (data as any).platforms : [];
    platformsIndexCache = platforms.slice();
    try {
      const runs = await loadBenchmarks();
      deviceSeriesCache = computeDeviceSeries(Array.isArray(runs) ? runs : []);
    } catch {}
    renderPlatformsTable();
    platformsLoaded = true;
    return;
    if (!platforms.length) {
      container.innerHTML = '<div class="meta">No platforms found.</div>';
      platformsLoaded = true;
      return;
    }
    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
      <thead>
        <tr>
          <th style=\"text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.08)\">Provider</th>
          <th style=\"text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.08)\">Device</th>
          <th style=\"text-align:right;padding:8px;border-bottom:1px solid rgba(0,0,0,.08)\">Runs</th>
          <th style=\"text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.08)\">Last seen</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody') as HTMLTableSectionElement;
    platforms.sort((a: any, b: any) => {
      const p = String(a.provider||'').localeCompare(String(b.provider||''));
      if (p !== 0) return p;
      return String(a.device||'').localeCompare(String(b.device||''));
    }).forEach((p: any) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style=\"padding:8px;border-bottom:1px solid rgba(0,0,0,.05)\">${escapeHtml(p.provider||'')}</td>
        <td style=\"padding:8px;border-bottom:1px solid rgba(0,0,0,.05)\"><button type=\"button\" class=\"btn\" data-provider=\"${escapeAttr(p.provider)}\" data-device=\"${escapeAttr(p.device)}\">${escapeHtml(p.device||'')}</button></td>
        <td style=\"padding:8px;border-bottom:1px solid rgba(0,0,0,.05);text-align:right\">${Number(p.runs)||0}</td>
        <td style=\"padding:8px;border-bottom:1px solid rgba(0,0,0,.05)\"><code>${escapeHtml(p.last_seen||'')}</code></td>`;
      tbody.appendChild(tr);
    });
    fragment.appendChild(table);
    container.innerHTML = '';
    container.appendChild(fragment);
    container.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const btn = (target && target.closest('button[data-provider][data-device]')) as HTMLButtonElement | null;
      if (btn) {
        const provider = btn.getAttribute('data-provider') || '';
        const device = btn.getAttribute('data-device') || '';
        openPlatformDetail(provider, device);
      }
    });
  } catch (err) {
    console.error('[platforms] init failed:', err);
    container.innerHTML = '<div style="padding:12px;color:#f88">Failed to load platforms.</div>';
  } finally {
    platformsLoaded = true;
  }
}

function escapeAttr(s: any) {
  return String(s).replace(/\"/g, '&quot;');
}

function getDeviceKey(provider: string, device: string) { return `${provider}::${device}`; }

function computeDeviceSeries(runs: any[]): Map<string, number[]> {
  const weeks = 12;
  const now = Date.now();
  const weekMs = 7*24*3600*1000;
  const edges: number[] = Array.from({length: weeks+1}, (_, i) => now - (weeks-i)*weekMs);
  const series = new Map<string, number[]>();
  runs.forEach((r: any) => {
    const provider = String(r.provider||'');
    const device = String(r.device||'');
    const ts = Number(new Date(r.timestamp||0));
    if (!Number.isFinite(ts)) return;
    let idx = -1;
    for (let i=0;i<weeks;i++){ if (ts>=edges[i] && ts<edges[i+1]) { idx = i; break; } }
    if (idx === -1) return;
    const key = getDeviceKey(provider, device);
    let arr = series.get(key);
    if (!arr) { arr = Array.from({length: weeks}, () => 0); series.set(key, arr); }
    arr[idx] += 1;
  });
  return series;
}

function computeBenchmarkSeries(runs: any[]): Map<string, number[]> {
  const weeks = 12;
  const now = Date.now();
  const weekMs = 7*24*3600*1000;
  const edges: number[] = Array.from({length: weeks+1}, (_, i) => now - (weeks-i)*weekMs);
  const series = new Map<string, number[]>();
  runs.forEach((r: any) => {
    const b = String(r.benchmark||'');
    const ts = Number(new Date(r.timestamp||0));
    if (!Number.isFinite(ts)) return;
    let idx = -1;
    for (let i=0;i<weeks;i++){ if (ts>=edges[i] && ts<edges[i+1]) { idx = i; break; } }
    if (idx === -1) return;
    let arr = series.get(b);
    if (!arr) { arr = Array.from({length: weeks}, () => 0); series.set(b, arr); }
    arr[idx] += 1;
  });
  return series;
}

function renderSparkline(values: number[], width=100, height=24, stroke='#2563eb') {
  if (!Array.isArray(values) || !values.length) return '';
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1 || 1);
  const pts: string[] = [];
  values.forEach((v, i) => {
    const x = i*step;
    const y = height - (v/max)*height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  const polyline = `<polyline fill="none" stroke="${stroke}" stroke-width="1.5" points="${pts.join(' ')}"/>`;
  const base = `<line x1="0" y1="${height}" x2="${width}" y2="${height}" stroke="rgba(0,0,0,.12)" stroke-width="1"/>`;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${base}${polyline}</svg>`;
}

function renderPlatformsTable() {
  const container = document.getElementById('platforms-container');
  if (!container) return;
  const filtered = Array.isArray(platformsIndexCache) ? platformsIndexCache.slice() : [];
  const frag = document.createDocumentFragment();
  const wrap = document.createElement('div');
  wrap.id = 'platforms-table-wrap';
  const table = document.createElement('table');
  table.className = 'smart-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Provider</th>
        <th>Device</th>
        <th class="num">Runs</th>
        <th>Last seen</th>
        <th>Activity</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody') as HTMLTableSectionElement;
  filtered.sort((a: any, b: any) => {
    const p = String(a.provider||'').localeCompare(String(b.provider||''));
    if (p !== 0) return p;
    return String(a.device||'').localeCompare(String(b.device||''));
  }).forEach((p: any) => {
    const tr = document.createElement('tr');
    const key = getDeviceKey(String(p.provider||''), String(p.device||''));
    const series = (deviceSeriesCache && deviceSeriesCache.get(key)) || [];
    const spark = series.length ? renderSparkline(series) : '';
    const href = `#view=platforms&provider=${encodeURIComponent(String(p.provider||''))}&device=${encodeURIComponent(String(p.device||''))}`;
    const isBaseline = baselineDevice && String(p.device||'') === baselineDevice;
    const deviceLabel = `${escapeHtml(p.device||'')}${isBaseline ? ' <span class=\"baseline-badge\">Baseline</span>' : ''}`;
    tr.innerHTML = `
      <td>${escapeHtml(p.provider||'')}</td>
      <td><a href="${href}">${deviceLabel}</a></td>
      <td class="num">${Number(p.runs)||0}</td>
      <td><code>${escapeHtml(p.last_seen||'')}</code></td>
      <td>${spark}</td>`;
    tbody.appendChild(tr);
  });
  wrap.appendChild(table);
  frag.appendChild(wrap);
  container.innerHTML = '';
  container.appendChild(frag);
}

async function initBenchmarksListView() {
  const container = document.getElementById('benchmarks-container');
  if (!container) return;
  container.innerHTML = '<div class="meta">Loading benchmarks…</div>';
  try {
    const data = await loadBenchmarks();
    const runs = Array.isArray(data) ? data : [];
    if (!runs.length) {
      container.innerHTML = '<div class="meta">No benchmarks found.</div>';
      return;
    }
    const map = new Map<string, { runs: number; providers: Set<string>; devices: Set<string>; last_seen: string }>();
    runs.forEach((run: any) => {
      const b = String(run.benchmark || 'Unknown');
      const ts = String(run.timestamp || '');
      const prev = map.get(b) || { runs: 0, providers: new Set(), devices: new Set(), last_seen: '' };
      prev.runs += 1;
      if (run.provider) prev.providers.add(String(run.provider));
      if (run.device) prev.devices.add(String(run.device));
      if (!prev.last_seen || (ts && ts > prev.last_seen)) prev.last_seen = ts;
      map.set(b, prev);
    });
    const rows = Array.from(map.entries()).map(([benchmark, v]) => ({
      benchmark,
      runs: v.runs,
      providers: Array.from(v.providers).sort(),
      devices: Array.from(v.devices).sort(),
      last_seen: v.last_seen,
    })).sort((a, b) => a.benchmark.localeCompare(b.benchmark));

    // Build modern-styled table like Platforms
    const wrap = document.createElement('div');
    wrap.id = 'benchmarks-table-wrap';
    const table = document.createElement('table');
    table.className = 'smart-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Name</th>
          <th class=\"num\">Runs</th>
          <th>Providers</th>
          <th>Devices</th>
          <th>Last seen</th>
          <th>Activity</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    try { benchmarkSeriesCache = computeBenchmarkSeries(runs); } catch {}
    const tbody = table.querySelector('tbody') as HTMLTableSectionElement;
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const href = `#view=benchmarks&benchmark=${encodeURIComponent(row.benchmark)}`;
      const series = (benchmarkSeriesCache && benchmarkSeriesCache.get(row.benchmark)) || [];
      const spark = series.length ? renderSparkline(series) : '';
      tr.innerHTML = `
        <td><a href=\"${href}\">${escapeHtml(row.benchmark)}</a></td>
        <td class=\"num\">${row.runs}</td>
        <td>${escapeHtml(row.providers.join(', '))}</td>
        <td>${escapeHtml(row.devices.join(', '))}</td>
        <td><code>${escapeHtml(row.last_seen||'')}</code></td>
        <td>${spark}</td>`;
      tbody.appendChild(tr);
    });
    wrap.appendChild(table);
    container.innerHTML = '';
    container.appendChild(wrap);
    // No JS listeners needed when using anchor links (hash routing handles open)
  } catch (err) {
    console.error('[benchmarks] init failed:', err);
    container.innerHTML = '<div style="padding:12px;color:#f88">Failed to load benchmarks.</div>';
  }
}

function openBenchmarkDetail(benchmark: string) {
  const runs = rawBenchmarks.filter((r: any) => String(r.benchmark||'') === benchmark);
  if (!runs.length) return;
  const metric = getActiveMetric();
  const list = buildRunList(runs, metric, 12, false) || '<li>No runs</li>';
  if (!detailModal || !detailTitle || !detailBody || !detailSubtitle) return;
  detailTitle.textContent = `${benchmark}`;
  detailSubtitle.textContent = `${runs.length} run${runs.length===1?'':'s'}`;
  detailBody.innerHTML = `<section class=\"detail-section\"><ul>${list}</ul></section>`;
  detailModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function adaptMetriqEtlRow(row: any) {
  const provider = row?.provider ?? 'Unknown';
  const device = row?.device ?? 'Unknown';
  const timestamp = row?.timestamp ?? null;
  const params = (row && typeof row.params === 'object') ? row.params : {};
  const jobType = row?.job_type ?? null;
  const benchmark = params?.benchmark_name ?? jobType ?? 'Unknown';
  // Prefer ETL 'metriq_score' but expose it as 'score' (single-benchmark score).
  // Keep raw results/errors for detail view, but do not surface them as chart/table metrics.
  const rawResults = (row && typeof row.results === 'object' && row.results != null) ? row.results : {};
  const rawErrors = (row && typeof row.errors === 'object' && row.errors != null) ? row.errors : {};
  const rawDirections = (row && typeof row.directions === 'object' && row.directions != null) ? row.directions : {};
  const rawParams = params;
  const score = Number(row?.metriq_score);
  let metrics: Record<string, number> = {};
  if (Number.isFinite(score)) {
    // Normalize the exposed metric id from 'metriq_score' → 'score'
    metrics = { score: score };
  } else {
    // Fallback: no metriq_score — keep metrics empty so the main view centers on metriq-score only.
    metrics = {};
  }
  const errors: Record<string, number> = {};
  return { provider, device, benchmark, timestamp, metrics, errors, rawResults, rawErrors, rawDirections, rawParams };
}

function normalizeRun(run: any) {
  const clone = { ...run };
  clone.provider = clone.provider ?? 'Unknown';
  clone.device = clone.device ?? 'Unknown';
  clone.benchmark = clone.benchmark ?? 'Unknown';
  const metrics: Record<string, number> = (clone && typeof clone.metrics === 'object' && clone.metrics != null)
    ? { ...(clone.metrics as Record<string, unknown>) as Record<string, number> }
    : {};
  const errors: Record<string, number> = (clone && typeof clone.errors === 'object' && clone.errors != null)
    ? { ...(clone.errors as Record<string, unknown>) as Record<string, number> }
    : {};
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
  searchInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      console.info('[search] enter pressed (link handling disabled)');
    }
  });
}

if (metricSelect) {
  metricSelect.addEventListener('change', () => {
    currentMetricId = (metricSelect as HTMLSelectElement).value;
    drawChart();
    // Refresh static table metric column as well
    drawTable();
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeDetail();
  }
});

if (detailModal) {
  detailModal.addEventListener('click', (event: MouseEvent) => {
    const t = event.target as HTMLElement | null;
    if (t === detailModal || (t && typeof (t as any).hasAttribute === 'function' && t.hasAttribute('data-detail-close'))) {
      closeDetail();
    }
  });
}

if (detailCloseBtn) {
  detailCloseBtn.addEventListener('click', () => closeDetail());
}

function uniqueValues(values: Array<Record<string, unknown>>, key: string) {
  const seen = new Set<string>();
  values.forEach(item => {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== "") {
      seen.add(String(value));
    }
  });
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

// Removed native <select> multi-select population; using custom lists instead

function populateFilterOptions(values) {
  // Render custom lists with symbols based on current data
  renderMultiLists();
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
    // Normalize config id 'metriq_score' → 'score'
    const rawId = String(def.id);
    const id = rawId === 'metriq_score' ? 'score' : rawId;
    defs.set(id, {
      id,
      label: def.label || (id === 'score' ? 'Score' : id),
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
        const label = key === 'score' ? 'Score' : key;
        defs.set(key, { id: key, label, unit: '', scale: 'linear', format: null, description: '' });
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
  const restrictToBenchmark = Array.isArray(filterState.benchmark) && filterState.benchmark.length > 0 && runs.length;
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
  // Custom multi-lists handle their own click events (renderMultiList)
  filtersInitialized = true;
}

// Device filter was removed; no-op retained previously has been deleted.

function getFilteredData() {
  const selProv = Array.isArray(filterState.provider) ? filterState.provider : [];
  const selBench = Array.isArray(filterState.benchmark) ? filterState.benchmark : [];
  if (selProv.length === 0 || selBench.length === 0) return [];
  return rawBenchmarks.filter(item => selProv.includes(String(item.provider||'')) && selBench.includes(String(item.benchmark||'')));
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
    <section class="detail-section">
      <h5>Job parameters</h5>
      ${renderJobParams(run)}
    </section>
    <section class="detail-section">
      <h5>Raw results</h5>
      <div class="detail-raw">
        ${renderRawResults(run)}
      </div>
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

function renderRawResults(run: any) {
  try {
    const res = (run && typeof run.rawResults === 'object' && run.rawResults != null) ? run.rawResults : {};
    const errs = (run && typeof run.rawErrors === 'object' && run.rawErrors != null) ? run.rawErrors : {};
    const dirs = (run && typeof run.rawDirections === 'object' && run.rawDirections != null) ? run.rawDirections : {};
    const keys = Object.keys(res);
    if (!keys.length) return '<div class="meta">No raw results available.</div>';
    keys.sort((a,b)=>a.localeCompare(b));
    const rows = keys.map(k => {
      const vRaw = res[k];
      const v = Number(vRaw);
      const vFmt = Number.isFinite(v) ? v.toLocaleString() : escapeHtml(String(vRaw));
      const e = Number(errs[k]);
      const eFmt = Number.isFinite(e) ? e.toLocaleString() : '';
      const d = (dirs && typeof dirs[k] === 'string') ? String(dirs[k]) : '';
      const disp = eFmt ? `${vFmt} ± ${eFmt}` : vFmt;
      const dirDisp = d ? escapeHtml(d) : '—';
      return `<tr><td>${escapeHtml(k)}</td><td class="num">${disp}</td><td>${dirDisp}</td></tr>`;
    }).join('');
    return `
      <div id="benchmarks-table-wrap">
        <table class="smart-table">
          <thead>
            <tr><th>Metric</th><th class="num">Value</th><th>Direction</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch {
    return '<div class="meta">Raw results unavailable.</div>';
  }
}

function renderJobParams(run: any) {
  try {
    const params = (run && typeof run.rawParams === 'object' && run.rawParams != null) ? run.rawParams : {};
    const keys = Object.keys(params);
    if (!keys.length) return '<div class="meta">No job parameters available.</div>';
    keys.sort((a,b)=>a.localeCompare(b));
    const rows = keys.map(k => {
      const v = params[k];
      const disp = (v == null) ? '—' : escapeHtml(String(v));
      return `<tr><td>${escapeHtml(k)}</td><td>${disp}</td></tr>`;
    }).join('');
    return `
      <div id="job-params-wrap">
        <table class="smart-table">
          <thead>
            <tr><th>Parameter</th><th>Value</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch {
    return '<div class="meta">Parameters unavailable.</div>';
  }
}

function buildRunList(runs, metric, limit, includeBenchmark) {
  const format = metric.format || '.3f';
  return runs
    .slice()
    .sort((a, b) => Number(new Date(b.timestamp)) - Number(new Date(a.timestamp)))
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

function formatDateOnly(value) {
  if (!value) return '—';
  try {
    return dateOnlyFormatter.format(new Date(value));
  } catch {
    // Fallback to YYYY-MM-DD if value is a string timestamp
    try {
      const d = new Date(value);
      if (!isNaN(Number(d))) {
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,'0');
        const day = String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
      }
    } catch {}
    return String(value);
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

  const embed: any = (globalThis as any).vegaEmbed;
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

  // Prepare fixed scales so UI colors/shapes match chart
  const allRuns = Array.isArray(rawBenchmarks) ? rawBenchmarks : [];
  const providers = uniqueValues(allRuns as any, 'provider');
  const benchmarks = uniqueValues(allRuns as any, 'benchmark');
  providerColorMap = buildColorMap(providers);
  benchmarkShapeMap = buildShapeMap(benchmarks);
  const colorDomain = providers;
  const colorRange = providers.map(p => providerColorMap.get(p) as string);
  const shapeDomain = benchmarks;
  const shapeRange = benchmarks.map(b => benchmarkShapeMap.get(b) as string);

  const spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: `${metricLabel} over time`,
    width: 'container',
    height: 420,
    autosize: { type: 'fit', contains: 'padding' },
    // Standard padding (no legends; using dropdown filters instead)
    padding: { left: 8, top: 8, right: 8, bottom: 8 },
    // Use default axis/grid styling
    // (grid lines allowed; baseline reference is handled via a rule layer below)
    data: { values },
    transform,
    // No legend-driven selections; dropdowns control filtering
    encoding: {
      x: { field: 'timestamp', type: 'temporal', title: 'Run date', axis: { format: '%Y-%m-%d' } }
    },
    layer: [
      // Invisible rule to pad x-domain by ±1 day so points aren't on edges
      {
        transform: [{
          aggregate: [
            { op: 'min', field: 'timestamp', as: 'x_min' },
            { op: 'max', field: 'timestamp', as: 'x_max' }
          ]
        },
        { calculate: "timeOffset('day', datum.x_min, -1)", as: 'x_pad_min' },
        { calculate: "timeOffset('day', datum.x_max, 1)", as: 'x_pad_max' }],
        mark: { type: 'rule', opacity: 0 },
        encoding: {
          x: { field: 'x_pad_min', type: 'temporal' },
          x2: { field: 'x_pad_max', type: 'temporal' },
          y: { datum: 100 }
        }
      },
      // Horizontal baseline at Score = 100 (across full width incl. padding)
      {
        transform: [{
          aggregate: [
            { op: 'min', field: 'timestamp', as: 'x_min' },
            { op: 'max', field: 'timestamp', as: 'x_max' }
          ]
        },
        { calculate: "timeOffset('day', datum.x_min, -1)", as: 'x_pad_min' },
        { calculate: "timeOffset('day', datum.x_max, 1)", as: 'x_pad_max' }
        ],
        mark: { type: 'rule', strokeDash: [6,4], opacity: 0.85 },
        encoding: {
          color: { value: '#9ca3af' },
          x: { field: 'x_pad_min', type: 'temporal' },
          x2: { field: 'x_pad_max', type: 'temporal' },
          y: { datum: 100 }
        }
      },
      // Points layer (filtered by dropdown state; no legends)
      {
        mark: { type: 'point', filled: true, size: 70, opacity: 0.95 },
        encoding: {
          y: { field: 'metricValue', type: 'quantitative', title: metricLabel, scale: yScale },
          color: { field: 'provider', type: 'nominal', legend: null, scale: { domain: colorDomain, range: colorRange } },
          shape: { field: 'benchmark', type: 'nominal', legend: null, scale: { domain: shapeDomain, range: shapeRange } },
          tooltip: [
            { field: 'device', title: 'Device' },
            { field: 'provider', title: 'Provider' },
            { field: 'benchmark', title: 'Benchmark' },
            { field: 'metricValue', title: metricLabel, type: 'quantitative', format: tooltipFormat },
            { field: 'metricError', title: 'Error', type: 'quantitative', format: tooltipFormat },
            { field: 'timestamp', title: 'Timestamp', type: 'temporal', format: '%Y-%m-%d %H:%M' }
          ]
        }
      }
    ]
  };
      
  // Baseline device no longer emphasized in the graph; use reference line instead.

  try {
    const { view } = await embed(el, spec, { actions: false, renderer: 'svg' });
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
    // Only open modal when a point (symbol) in the plot area is clicked
    view.addEventListener('click', (event: any, item: any) => {
      try {
        if (item && item.mark && item.mark.marktype === 'symbol' && item.datum && typeof item.datum.metricValue !== 'undefined') {
          openRunDetail(item.datum);
        }
      } catch {}
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

// ---- Static Smart Table (sorting + filters independent of chart) ----
// Broaden SortKey to plain string for wider TS compatibility (older TS lacks template literal types)
type SortKey = 'timestamp' | 'provider' | 'device' | 'benchmark' | string;
type TableState = {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  filterText: string;
  filterProvider: string; // 'all' or provider
  filterDevice: string;   // 'all' or device
  filterBenchmark: string; // 'all' or benchmark
};

let tableState: TableState = {
  sortKey: 'timestamp',
  sortDir: 'desc',
  filterText: '',
  filterProvider: 'all',
  filterDevice: 'all',
  filterBenchmark: 'all',
};

function ensureTableUI() {
  const container = document.getElementById('table-static');
  if (!container) return null as HTMLDivElement | null;
  if (container.getAttribute('data-smart') === '1') return container as HTMLDivElement;
  container.setAttribute('data-smart', '1');
  const controls = document.createElement('div');
  controls.className = 'smart-controls';
  controls.innerHTML = `
    <label class="smart-field">
      <span>Search</span>
      <input id="smart-q" type="search" placeholder="Search all columns" autocomplete="off" />
    </label>
    <label class="smart-field">
      <span>Provider</span>
      <select id="smart-provider"><option value="all">All</option></select>
    </label>
    <label class="smart-field">
      <span>Device</span>
      <select id="smart-device"><option value="all">All</option></select>
    </label>
    <label class="smart-field">
      <span>Benchmark</span>
      <select id="smart-benchmark"><option value="all">All</option></select>
    </label>
    <button type="button" class="btn" id="smart-reset">Reset</button>
  `;
  const tableWrap = document.createElement('div');
  tableWrap.id = 'smart-table-wrap';
  container.innerHTML = '';
  container.appendChild(controls);
  container.appendChild(tableWrap);
  return container as HTMLDivElement;
}

function getMetricSortValue(run: any, metricId: string) {
  const v = getMetricValue(run, metricId);
  return Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
}

function populateSmartFilters(values: any[]) {
  const provSel = document.getElementById('smart-provider') as HTMLSelectElement | null;
  const devSel = document.getElementById('smart-device') as HTMLSelectElement | null;
  const benchSel = document.getElementById('smart-benchmark') as HTMLSelectElement | null;
  const unique = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  if (provSel) {
    const opts = unique(values.map(v => String(v.provider||'')));
    provSel.innerHTML = '<option value="all">All</option>' + opts.map(o=>`<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join('');
    provSel.value = tableState.filterProvider || 'all';
  }
  if (devSel) {
    const opts = unique(values.map(v => String(v.device||'')));
    devSel.innerHTML = '<option value="all">All</option>' + opts.map(o=>`<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join('');
    devSel.value = tableState.filterDevice || 'all';
  }
  if (benchSel) {
    const opts = unique(values.map(v => String(v.benchmark||'')));
    benchSel.innerHTML = '<option value="all">All</option>' + opts.map(o=>`<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join('');
    benchSel.value = tableState.filterBenchmark || 'all';
  }
}

function applyTableFilters(values: any[]) {
  const q = (tableState.filterText || '').toLowerCase();
  return values.filter(v => {
    if (tableState.filterProvider !== 'all' && String(v.provider||'') !== tableState.filterProvider) return false;
    if (tableState.filterDevice !== 'all' && String(v.device||'') !== tableState.filterDevice) return false;
    if (tableState.filterBenchmark !== 'all' && String(v.benchmark||'') !== tableState.filterBenchmark) return false;
    if (q) {
      const blob = `${v.timestamp||''} ${v.provider||''} ${v.device||''} ${v.benchmark||''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function sortTableRows(values: any[]) {
  const { sortKey, sortDir } = tableState;
  const mul = sortDir === 'asc' ? 1 : -1;
  const cmp = (a: any, b: any) => {
    let av:any, bv:any;
    if (sortKey === 'timestamp') { av = Number(new Date(a.timestamp)); bv = Number(new Date(b.timestamp)); }
    else if (sortKey === 'provider') { av = String(a.provider||''); bv = String(b.provider||''); }
    else if (sortKey === 'device') { av = String(a.device||''); bv = String(b.device||''); }
    else if (sortKey === 'benchmark') { av = String(a.benchmark||''); bv = String(b.benchmark||''); }
    else if (typeof sortKey === 'string' && sortKey.startsWith('metric:')) {
      const id = sortKey.slice('metric:'.length);
      av = getMetricSortValue(a, id);
      bv = getMetricSortValue(b, id);
    } else { av = 0; bv = 0; }
    if (av < bv) return -1*mul;
    if (av > bv) return 1*mul;
    return 0;
  };
  values.sort(cmp);
}

function renderStaticTable(values: any[]) {
  const container = ensureTableUI();
  const wrap = document.getElementById('smart-table-wrap');
  const skeletonTable = document.getElementById('skeleton');
  if (!container || !wrap) return;
  if (skeletonTable) skeletonTable.style.display = 'block';
  const metric = getActiveMetric();

  // Init filters if first time
  populateSmartFilters(values);

  // Apply filters and sorting
  const working = applyTableFilters(values.slice());
  sortTableRows(working);

  const table = document.createElement('table');
  table.className = 'smart-table';
  const sortIcon = (key: SortKey) => tableState.sortKey===key ? (tableState.sortDir==='asc'?' ▲':' ▼') : '';
  // Build metric columns dynamically
  let metricDefs = Array.isArray(allMetricDefs) && allMetricDefs.length ? allMetricDefs : [];
  if (!metricDefs.length) {
    const ids = Array.from(collectMetricIdsWithValues(working) as any) as string[];
    metricDefs = ids.map(id => ({ id, label: id, unit: '', scale: 'linear', format: null } as any));
  }
  const metricHeaders = metricDefs.map((def: any) => `<th data-sort="metric:${escapeAttr(def.id)}" class="sortable num">${escapeHtml(buildMetricLabel(def))}${sortIcon(`metric:${def.id}` as SortKey)}</th>`).join('');
  table.innerHTML = `
    <thead>
      <tr>
        <th data-sort="provider" class="sortable">Provider${sortIcon('provider')}</th>
        <th data-sort="device" class="sortable">Device${sortIcon('device')}</th>
        <th data-sort="benchmark" class="sortable">Benchmark${sortIcon('benchmark')}</th>
        ${metricHeaders}
        <th data-sort="timestamp" class="sortable">Date${sortIcon('timestamp')}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody') as HTMLTableSectionElement;
  working.forEach(run => {
    const metricValue = getMetricValue(run, metric.id);
    const err = getMetricError(run, metric.id);
    const formatted = formatMetricValue(metricValue, metric.format || '.3f', metric.unit);
    const display = err !== null
      ? `${formatted} ± ${formatMetricValue(err, metric.format || '.3f', metric.unit)}`
      : formatted;
    const tr = document.createElement('tr');
    const deviceHref = `#`;
    const benchHref = `#`;
    const isBaseline = baselineDevice && String(run.device||'') === baselineDevice;
    const deviceLabel = `${escapeHtml(run.device || '')}${isBaseline ? ' <span class=\"baseline-badge\">Baseline</span>' : ''}`;
    const metricCells = metricDefs.map((def: any) => {
      const mv = getMetricValue(run, def.id);
      const me = getMetricError(run, def.id);
      const disp = me !== null && me !== undefined && Number.isFinite(Number(me))
        ? `${formatMetricValue(mv, def.format || '.3f', def.unit)} ± ${formatMetricValue(me, def.format || '.3f', def.unit)}`
        : formatMetricValue(mv, def.format || '.3f', def.unit);
      const isScore = def.id === 'score';
      const content = isScore ? `<a href="#" class="metric-link" data-role="score">${disp}</a>` : disp;
      return `<td class="num">${content}</td>`;
    }).join('');
    tr.innerHTML = `
      <td>${escapeHtml(run.provider || '')}</td>
      <td><a href="${deviceHref}" class="metric-link" data-role="device">${deviceLabel}</a></td>
      <td><a href="${benchHref}" class="metric-link" data-role="benchmark">${escapeHtml(run.benchmark || '')}</a></td>
      ${metricCells}
      <td><code>${escapeHtml(formatDateOnly(run.timestamp))}</code></td>`;
    tbody.appendChild(tr);
    // Make entire row clickable to open details
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (ev) => {
      ev.preventDefault();
      openRunDetail(run);
    });
    // Make score cell clickable to open details
    const scoreLink = tr.querySelector('a.metric-link[data-role="score"]') as HTMLAnchorElement | null;
    if (scoreLink) {
      scoreLink.addEventListener('click', (ev) => { ev.preventDefault(); openRunDetail(run); });
    }
    // Make device cell open detail (instead of jumping to platforms)
    const deviceLink = tr.querySelector('a.metric-link[data-role="device"]') as HTMLAnchorElement | null;
    if (deviceLink) {
      deviceLink.addEventListener('click', (ev) => { ev.preventDefault(); openRunDetail(run); });
    }
    // Make benchmark cell open detail (to view parameters)
    const benchLink = tr.querySelector('a.metric-link[data-role="benchmark"]') as HTMLAnchorElement | null;
    if (benchLink) {
      benchLink.addEventListener('click', (ev) => { ev.preventDefault(); openRunDetail(run); });
    }
  });

  // Attach sort handlers
  table.querySelectorAll('th[data-sort]')
    .forEach((th: any) => {
      th.addEventListener('click', () => {
        const key = String(th.getAttribute('data-sort')) as SortKey;
        if (tableState.sortKey === key) {
          tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          tableState.sortKey = key;
          const isNumeric = key === 'timestamp' || (typeof key === 'string' && key.startsWith('metric:'));
          tableState.sortDir = isNumeric ? 'desc' : 'asc';
        }
        renderStaticTable(values);
      });
    });

  // Wire filter controls (debounced text)
  const qInput = document.getElementById('smart-q') as HTMLInputElement | null;
  const provSel = document.getElementById('smart-provider') as HTMLSelectElement | null;
  const devSel = document.getElementById('smart-device') as HTMLSelectElement | null;
  const benchSel = document.getElementById('smart-benchmark') as HTMLSelectElement | null;
  const resetBtn = document.getElementById('smart-reset') as HTMLButtonElement | null;
  let qTimer:any;
  if (qInput) {
    qInput.value = tableState.filterText || '';
    qInput.oninput = () => {
      clearTimeout(qTimer);
      qTimer = setTimeout(()=>{ tableState.filterText = qInput.value || ''; renderStaticTable(values); }, 150);
    };
  }
  provSel && (provSel.onchange = () => { tableState.filterProvider = provSel.value; renderStaticTable(values); });
  devSel && (devSel.onchange = () => { tableState.filterDevice = devSel.value; renderStaticTable(values); });
  benchSel && (benchSel.onchange = () => { tableState.filterBenchmark = benchSel.value; renderStaticTable(values); });
  resetBtn && (resetBtn.onclick = () => {
    tableState = { sortKey: 'timestamp', sortDir: 'desc', filterText: '', filterProvider: 'all', filterDevice: 'all', filterBenchmark: 'all' };
    renderStaticTable(values);
  });

  wrap.innerHTML = '';
  wrap.appendChild(table);
  if (skeletonTable) skeletonTable.style.display = 'none';
}

async function drawTable() {
  try {
    await loadBenchmarks();
    // Always include all runs, independent from chart filters
    renderStaticTable(Array.isArray(rawBenchmarks) ? rawBenchmarks : []);
  } catch (err) {
    const container = document.getElementById('table-static');
    if (container) {
      container.innerHTML = '<div style="padding:12px;color:#f88">Failed to render table.</div>';
    }
    const skeletonTable = document.getElementById('skeleton');
    if (skeletonTable) skeletonTable.style.display = 'none';
  }
}

async function drawChart() {
  const token = ++renderSequence;
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
    // Read baseline device from config if available
    try {
      const bd = (config && typeof (config as any).baselineDevice === 'string') ? String((config as any).baselineDevice).trim() : '';
      baselineDevice = bd || null;
    } catch { baselineDevice = null; }
    setupMetrics(rawBenchmarks, config);
    setupFilters(rawBenchmarks);
    refreshMetricOptions(rawBenchmarks);
    await drawChart();
    await drawTable();
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
    const yearEl = slot.querySelector('#footer-year') as HTMLElement | null;
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  } catch (err) {
    console.warn('[footer] load failed:', err);
    slot.innerHTML = '<footer class="site-footer"><div class="footer-inner"><small>Metriq — footer unavailable.</small></div></footer>';
  }
}

injectFooter();
