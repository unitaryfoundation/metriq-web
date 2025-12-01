# Metriq New App

This directory contains the standalone benchmarks UI. It can be served via nginx or run as a container.

## Docker workflow

```bash
# build the image
METRIQ_TAG=metriq-newapp:latest
docker build -t $METRIQ_TAG metriq-newapp

# run the container (regenerates the Metabase embed at startup)
docker run -d \
  -p 8080:80 \
  -e METABASE_SECRET_KEY=super-secret \
  -e METABASE_QUESTION_ID=52 \
  -e METABASE_SITE_URL=https://metriq.info/meta \
  -e METABASE_TTL_SECONDS=$((60*60*24*14)) \
  -e BENCHMARKS_URL=https://raw.githubusercontent.com/org/benchmarks/main/latest.json \
  --name metriq-newapp \
  $METRIQ_TAG
```

### Local metriq-data integration

When developing locally with the metriq-data repo checked out alongside metriq-web, you can have the UI read the local `dist/` outputs directly instead of GitHub-hosted JSON. The entrypoint will prefer a mounted `/usr/share/nginx/html/metriq-data` and set the URLs automatically. Example:

```bash
# Assume directory layout
#   /path/to/metriq-data/dist
#   /path/to/metriq-web/metriq-newapp

# From the repo root or any directory, build the image as above, then run:
docker run -d \
  -p 8080:80 \
  -v /path/to/metriq-data/dist:/usr/share/nginx/html/metriq-data:ro \
  --name metriq-newapp-local \
  metriq-newapp:latest
```

In this setup:
- Nginx serves the metriq-data dist files under `/metriq-data/...` inside the container.
- The entrypoint script detects the mounted dist and sets:
  - `benchmarksUrl` → `/metriq-data/benchmark.latest.json` (unless BENCHMARKS_URL is set)
  - `platformsIndexUrl` → `/metriq-data/platforms/index.json` (unless PLATFORMS_INDEX_URL is set)

Running `python scripts/aggregate.py` in the metriq-data repo before starting the container ensures the `dist/` directory is up to date.

The container reads `data/metabase-embed.json` and `data/config.json`. If Metabase variables aren’t supplied it reuses the baked embed URL. If `BENCHMARKS_URL` is omitted it serves the bundled `data/benchmarks.json`. Add benchmark landing pages to `config.json` under `benchmarkPages` so the search box populates dropdown suggestions. Clicking a point in the accuracy-vs-time chart opens an in-app detail modal for that run.

## Updating the embed URL outside Docker

```
METABASE_SECRET_KEY=super-secret \
METABASE_QUESTION_ID=52 \
METABASE_SITE_URL=https://metriq.info/meta \
node scripts/generate-metabase-embed.js
```

By design the generated `data/metabase-embed.json` is ignored by git; commit `data/metabase-embed.json.example` if you need a placeholder while developing locally.

## GitHub Pages CI/CD pipeline

Deploying the static site is handled by `.github/workflows/metriq-newapp-deploy.yml`. The workflow runs when files inside `metriq-newapp/` change or when triggered manually. It:

1. Installs Node dependencies.
2. Runs `scripts/generate-metabase-embed.js` to mint a fresh signed iframe URL.
3. Uploads the `metriq-newapp/` bundle (minus Docker/scripts assets) to GitHub Pages.

### Required repository secrets

Add these secrets in your GitHub repository settings so the workflow can talk to Metabase:

| Secret | Description |
| --- | --- |
| `METABASE_SECRET_KEY` | Metabase embedding secret |
| `METABASE_QUESTION_ID` | Numeric question ID to embed |
| `METABASE_SITE_URL` | Base URL for your Metabase instance, e.g. `https://metriq.info/meta` |
| `METABASE_BORDERED` *(optional)* | `true` or `false` for iframe chrome |
| `METABASE_TITLED` *(optional)* | `true` or `false` for the iframe header |
| `METABASE_TTL_SECONDS` *(optional)* | Override JWT TTL in seconds |

Once the secrets are set, push to the `static-app` branch (or trigger `workflow_dispatch`) and GitHub Pages will publish the latest build. The workflow stores no secrets in the repository—`data/metabase-embed.json` is generated at runtime and excluded from git history.

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
