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

## GitHub Pages CI/CD pipeline

Production and pull-request previews share the `gh-pages` deployment branch:

- `.github/workflows/deploy-pages.yml` deploys production after pushes to `main`.
- `.github/workflows/pr-preview.yml` deploys same-repository pull requests to
  `https://metriq.info/pr-preview/pr-<number>/`, posts a sticky preview link on the pull
  request, updates it on new commits, and removes it when the pull request closes.
- Production deployments preserve the `pr-preview/` directory, so updating production does
  not remove active previews.

Both workflows use `npm run build:site`, which compiles TypeScript, generates the RSS feed,
and prepares the static `build/` directory. Production adds the custom-domain `CNAME`; preview
artifacts intentionally do not.

Repository settings must use **Settings → Pages → Deploy from a branch**, with `gh-pages` and
`/(root)` selected. **Settings → Actions → General → Workflow permissions** must allow read and
write access so the workflows can update `gh-pages` and the preview comment.

When migrating an existing deployment, let the production workflow populate `gh-pages` before
switching the Pages source, so the custom-domain site remains available throughout the change.

The default GitHub token cannot deploy previews for pull requests from forks. Those workflows
report the skipped deployment in their job summary instead of running untrusted fork code with
elevated permissions.

## Metrics support

- By default the app visualizes a single `score` (scalar) per run when present in the dataset (normalized from the ETL `metriq_score`). This is the only metric shown in the chart and table.
- Raw benchmark results (per-metric values, errors, directions) are still available in the run detail modal under "Raw results".
- `config.json` can declare `metrics` definitions (id, label, unit, scale, format). Any `metriq_score` id in config is normalized to `score`; otherwise the app falls back to whatever metrics exist in `metrics` for legacy datasets.

## Baseline highlighting

- To highlight a specific device across both the chart and the table, add `baselineDevice` to `data/config.json`:

```json
{
  "benchmarksUrl": "https://unitaryfoundation.github.io/metriq-data/benchmark.latest.json",
  "platformsIndexUrl": "https://unitaryfoundation.github.io/metriq-data/platforms/index.json",
  "baselineDevice": "Device A",
  "benchmarkPages": []
}
```

- The baseline device will render with a bold badge in the table and an emphasized overlay in the chart.

## Guided Tour

The app includes a guided tour powered by [Driver.js](https://driverjs.com/) to help new users navigate the interface.

- **Entry Point**: `tour.ts` contains the tour configuration and logic.
- **Integration**: The tour instance is attached to `window.MetriqTour` and initialized in `main.ts`. Users can start the tour using the "Take a tour" button.
- **Maintenance**: To update steps or copy, edit the `getSteps()` method in `tour.ts`.
