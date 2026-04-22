# Render Deployment

This repo now includes a minimal hosted wrapper around the existing local `career-ops` scripts.

## What was added

- `web/server.mjs` - HTTP server for Render
- `web/public/*` - browser UI for setup, actions, tracker, reports, and PDFs
- `web/lib/persistence.mjs` - persistent-disk bootstrap and sync layer
- `Dockerfile` - Playwright-ready container image
- `render.yaml` - Render Blueprint with a persistent disk

## Hosted architecture

The hosted version keeps the original scripts and file layout, but adds:

- a web UI instead of relying on the Go TUI
- Basic Auth so the Render URL is not public to everyone
- a persistent disk to keep `cv.md`, `config/profile.yml`, `portals.yml`, tracker data, reports, and PDFs across deploys

The server restores these managed paths into the app workspace on startup:

- `cv.md`
- `article-digest.md`
- `config/profile.yml`
- `portals.yml`
- `data/`
- `reports/`
- `output/`
- `jds/`
- `interview-prep/story-bank.md`
- `batch/logs/`
- `batch/tracker-additions/`
- `batch/batch-input.tsv`
- `batch/batch-state.tsv`

## Render setup

1. Push this code to your GitHub repo.
2. In Render, create a new Blueprint from the repo.
3. When prompted, fill in:
   - `BASIC_AUTH_USERNAME`
   - `BASIC_AUTH_PASSWORD`
4. Keep the persistent disk enabled.
5. Deploy.

## First run after deploy

Open the Render URL and sign in with Basic Auth.

Then update these files in the browser UI:

- `config/profile.yml`
- `cv.md`
- `jds/current-jd.md`
- `portals.yml`
- `article-digest.md` (optional)

After saving them, use the Actions panel to run:

1. `Doctor`
2. `Verify Pipeline`
3. `Scan Portals` when you are ready

## Curl updates

You can also update key files directly with `curl`.

Resume:

```bash
curl -X PUT "$APP_URL/api/raw/resume" \
  -u "$BASIC_AUTH_USERNAME:$BASIC_AUTH_PASSWORD" \
  --data-binary @cv.md
```

Current JD:

```bash
curl -X PUT "$APP_URL/api/raw/jd" \
  -u "$BASIC_AUTH_USERNAME:$BASIC_AUTH_PASSWORD" \
  --data-binary @job-description.md
```

Read them back:

```bash
curl -u "$BASIC_AUTH_USERNAME:$BASIC_AUTH_PASSWORD" "$APP_URL/api/raw/resume"
curl -u "$BASIC_AUTH_USERNAME:$BASIC_AUTH_PASSWORD" "$APP_URL/api/raw/jd"
```

## Important tradeoffs

- This is still file-based storage, not a full multi-user web app.
- The original Go terminal dashboard is not used in the hosted deployment.
- Because the app uses a persistent disk, this service should stay at a single instance.
- `scan.mjs` and other networked scripts depend on outbound connectivity from Render and valid config in `portals.yml`.
