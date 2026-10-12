# Cheap Flights Finder

Web app that finds the **cheapest direct flight** and the **cheapest flight with at most
2 stops** (stopover ≤ 3 hours) between two cities/airports for a vacation of a given length.
Supports country inputs (expands to that country's commercial airports), flexible date
windows, stay-length ranges, and open-jaw (different return airport).

## Architecture

The app is split into **two deployable pieces**:

```
┌─────────────────────────────┐       ┌──────────────────────────────────┐
│  GitHub Pages (static)      │  CORS │  Flask backend (free host)       │
│  docs/                      │ ─────►│  app.py                           │
│  - HTML/CSS/JS in browser   │ POST  │  - fast-flights → Google Flights │
│  - city/country → IATA      │       │  - samples dates, filters prices │
│    resolution, client-side  │       │  - /api/search, /api/ping        │
└─────────────────────────────┘       └──────────────────────────────────┘
```

- **Frontend (`docs/`)** — a fully static site served by GitHub Pages. It resolves
  city/country/IATA inputs to airport codes in the browser (airports dataset is fetched
  directly with CORS). *No server-side code runs here.*
- **Backend (`app.py`)** — the same Python app as before, now deployed to any always-on
  host (Render, Railway, Fly.io, a VPS, …). It scrapes Google Flights via the open-source
  [`fast-flights`](https://github.com/AWeirdDev/flights) library and exposes the results
  over CORS-enabled JSON endpoints that the static frontend calls.

> GitHub Pages cannot run Python, and Google Flights blocks direct browser fetches —
> that is why live prices require the backend.

## Deploy the backend (one time)

Pick any free host that runs a Python web server. This repo ships a **`Dockerfile`**, so
any Docker-based platform works with no build configuration.

### Zeabur (recommended — no credit card)

1. Sign up at [zeabur.com](https://zeabur.com) with GitHub (**no credit card required**).
2. **Create Project → Deploy from GitHub** and pick this repo. Zeabur detects the
   `Dockerfile` and builds the backend automatically.
3. Zeabur injects `$PORT`; the container already binds to it. Copy the public URL, e.g.
   `https://flights-chart-backend.zeabur.app`.
4. The free plan **auto-sleeps when idle and wakes on the next request** (a few seconds).

### Manual path — any host (Render/Railway/Fly/VPS/Cloud Run)

Either use the bundled `Dockerfile`, or create a Python web service with:

- **Build command**: `pip install -r requirements.txt`
- **Start command**: `gunicorn app:app`

> A free instance usually **sleeps when idle**; the first request after a pause can take
> ~30–60 s to wake up. That is expected. A single search also runs many sequential Google
> requests, so allow generous request timeouts (the Dockerfile sets `--timeout 300`).

(For local testing just run `pip install -r requirements.txt` then `python app.py` →
`http://127.0.0.1:5000`.)

## Point the frontend at the backend

After deploying, tell the static site where the backend lives — **either**:

- Edit `docs/config.js` and set `window.FLIGHT_BACKEND` to the backend URL, **or**
- Let visitors type the URL themselves in the in-page **⚙️ Backend settings**
  (saved in their browser only).

If no URL is configured the app explains exactly what to do, so the page never looks broken.

## Publish on GitHub Pages

1. **Create the repository**
   ```bash
   git init
   git add .
   git commit -m "Static GitHub Pages frontend + Flask backend"
   gh repo create flights-chart --public --source=. --push
   ```
   (or create a repo on github.com and `git remote add origin …; git push -u origin main`)

2. **Enable Pages** — one of these two:
   - **Recommended:** the included workflow `.github/workflows/deploy-pages.yml` deploys
     `docs/` automatically on every push to `main`. In the repo:
     **Settings → Pages → Source: "GitHub Actions"**.
   - Manual alternative: **Settings → Pages → Source: "Deploy from a branch"** →
     branch `main` → folder `/docs`.

Your site is live at `https://<user>.github.io/<repo>/`.

## Local development

```bash
# terminal 1 — backend
pip install -r requirements.txt
python app.py

# then open docs/index.html directly in a browser,
# or serve it statically:
python -m http.server 8000 --directory docs
```

In the site, open **⚙️ Backend settings** and enter `http://127.0.0.1:5000`.

## How it works

- Uses the open-source [`fast-flights`](https://github.com/AWeirdDev/flights) library, which
  reverse-engineers Google Flights search (no official Google Flights API exists).
- Resolves city names or IATA codes to airports using a public airports dataset
  [`mwgg/Airports`](https://github.com/mwgg/Airports).
- Searches round-trip for the vacation days and date window you specify.
- Filters:
  - **Direct**: 0 stops
  - **With stops**: ≤ 2 stops and every layover ≤ 180 minutes

## Notes / Limitations

- There is **no official Google Flights API**. This uses an unofficial scraper. Google may
  rate-limit or block requests, and free hosts spin down.
- **Google's consent wall.** From EU / datacenter IPs Google serves a consent interstitial
  instead of results, which breaks the scraper. The backend works around this by sending a
  `SOCS` consent cookie (see `_CONSENT_COOKIES` in `app.py`) and falls back to the default
  fetcher if that is unavailable. If results suddenly stop, that cookie may need refreshing.
- Prices are live estimates only — not bookable through this app.
- City resolution works best for major cities; prefer IATA codes (JFK, LHR, CDG, …) for reliability.
- Round-trip results sometimes surface mainly the outbound leg details depending on how
  Google structures the response; the price is for the full trip.
- Max trip length capped at 30 days, date window capped at 31 calendar days for practical
  search reasons.

## Example

- From: `New York` or `JFK`
- To: `London` or `LHR`
- Vacation days: `7`
- Optional departure date