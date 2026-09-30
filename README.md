# Metriq Web
This directory contains the standalone benchmarks UI. It can be served via an nginx server or run as a container.

The shipped entrypoint is `main.js`, which is generated from the versioned `main.ts`.

## Local development (watch + reload)

Run a TypeScript watcher and a live-reloading static server in two terminals:

```bash
# Terminal 1: compile TypeScript on save
cd metriq-web
npx tsc -p . --watch --preserveWatchOutput
```

```bash
# Terminal 2: serve the static site and auto-reload when main.js changes
cd metriq-web
npx live-server . --port=8080
```

Then open `http://localhost:8080`.

### Debugging TypeScript via sourcemaps

`tsconfig.json` defaults to `"sourceMap": false` for the shipped bundle, but you can enable sourcemaps for local debugging by passing flags to `tsc`:

```bash
cd metriq-web
npx tsc -p . --watch --sourceMap --inlineSources --preserveWatchOutput
```

In Chrome DevTools, ensure “Enable JavaScript source maps” is on; you should be able to set breakpoints in `main.ts`.

## Docker workflow

```bash
# build the image
METRIQ_TAG=metriq-web:latest
docker build -t $METRIQ_TAG .

# run the container
docker run -d \
  -p 8080:80 \
  --name metriq-web \
  $METRIQ_TAG
```

### Local metriq-data integration

When developing locally with the metriq-data repo checked out alongside metriq-web, you can have the UI read the local `dist/` outputs directly instead of GitHub-hosted JSON. The entrypoint will prefer a mounted `/usr/share/nginx/html/metriq-data` and set the URLs automatically. Example:

```bash
# Assume directory layout
#   /path/to/metriq-data/dist
#   /path/to/metriq-web

# From the repo root or any directory, build the image as above, then run:
docker run -d \
  -p 8080:80 \
  -v /path/to/metriq-data/dist:/usr/share/nginx/html/metriq-data:ro \
  --name metriq-web-local \
  metriq-web:latest
```

In this setup:

- Nginx serves the metriq-data dist files under `/metriq-data/...` inside the container.
- The entrypoint script detects the mounted dist and sets:
  - `benchmarksUrl` → `/metriq-data/benchmark.latest.json` (unless BENCHMARKS_URL is set)
  - `platformsIndexUrl` → `/metriq-data/platforms/index.json` (unless PLATFORMS_INDEX_URL is set)

Running `python scripts/aggregate.py` in the metriq-data repo before starting the container ensures the `dist/` directory is up to date.

The container reads `data/config.json`. Add benchmark landing pages to `config.json` under `benchmarkPages` so the search box populates dropdown suggestions. Clicking a point in the score-vs-time chart opens an in-app detail modal for that run.

Providers listed in `hiddenProviders` remain available in the source dataset and downloads but are omitted from the platform and results views. The `local` provider is hidden by default and in the production configuration so simulator runs are not confused with hardware results, even if configuration loading fails. Set `"hiddenProviders": []` in a local configuration when those records are useful for development.

## GitHub Pages CI/CD pipeline

Deploying the static site is handled by `.github/workflows/deploy-pages.yml`. The workflow runs on pushes to `main` or when triggered manually. It:

1. Installs Node dependencies.
2. Builds TypeScript from the repo root.
3. Uploads the static site bundle (`index.html`, compiled JS, CSS, `data/`, and `public/`) to GitHub Pages.

Push to `main` (or trigger `workflow_dispatch`) and GitHub Pages will publish the latest build.

## Metrics support

- By default the app visualizes a single `score` (scalar) per run when present in the dataset (normalized from the ETL `metriq_score`). This is the only metric shown in the chart and table.
- Raw benchmark results (per-metric values, errors, directions) are still available in the run detail modal under "Raw results".
- `config.json` can declare `metrics` definitions (id, label, unit, scale, format). Any `metriq_score` id in config is normalized to `score`; otherwise the app falls back to whatever metrics exist in `metrics` for legacy datasets.

## Comparison scoring

The browser calculates Overlap Score for the two selected devices; `metriq-data`
does not precompute device pairs. `platform-scoring.ts` reproduces the canonical
benchmark aggregation using the measurements, baselines, directions, and weights
published in each device's component breakdown.

A measurement is included only when both devices have the inputs required by
that benchmark's aggregation. Otherwise it is treated as missing on both sides.
The calculation retains each device's original weights and the full suite
denominator, including the existing within-benchmark coverage penalty. It never
redistributes excluded weights or inserts a literal zero into a harmonic mean.
The full Metriq Score uses all of that device's own measurements, independently
of the comparison peer.

Arithmetic benchmark groups aggregate raw values before baseline normalization;
harmonic groups combine normalized values. This order is also used when All-time
mode selects a better record: its raw result, baseline, and direction move
together before the full score and overlap are calculated separately.

The data feed must expose component `baseline` and `direction` fields, plus
`baseline_is_self` and row `normalization_baselines` for All-time selection.
Deploy that additive data update before this frontend. Older payloads without
enough inputs show an unavailable Overlap Score and retain their published full
score; the client does not approximate the missing calculation with a sum of
individual normalized ratios.

## Baseline highlighting

- The baseline is read from the `baseline` object published at the root of the platforms index JSON served at the
  configured `platformsIndexUrl`:

```json
{
  "baseline": {
    "provider": "<provider>",
    "device": "<device>",
    "series": "<series>"
  }
}
```

- The provider and device are matched together, and the baseline platform renders with
  a badge wherever device labels are shown. Score charts use the horizontal 100-point
  reference line. Baseline selection remains owned by `metriq-data`; no duplicate web
  configuration is required.

## Guided Tour

The app includes a guided tour powered by [Driver.js](https://driverjs.com/) to help new users navigate the interface.

- **Entry Point**: `tour.ts` contains the tour configuration and logic.
- **Integration**: The tour instance is attached to `window.MetriqTour` and initialized in `main.ts`. Users can start the tour using the "Take a tour" button.
- **Maintenance**: To update steps or copy, edit the `getSteps()` method in `tour.ts`.
