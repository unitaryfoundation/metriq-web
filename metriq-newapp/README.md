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
- `config.json` can declare `metrics` definitions (id, label, unit, scale, format).
- Each run in `benchmarks.json` should provide a `metrics` object; the chart lets users switch between available metrics, adjusting axes and tooltips dynamically.
