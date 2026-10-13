# Cheap Flights Finder

Web app that finds the **cheapest direct flight** and the **cheapest flight with at most
2 stops** (stopover ≤ 3 hours) between two cities/airports for a vacation of a given length.
Supports country inputs (expands to **every** commercial airport in that country — all of them
are searched), explicit airport lists (`DUS, FRA, HAM`), flexible date windows, stay-length
ranges, open-jaw (different return airport), and an optional **direct-only (nonstop)** filter.
Every result lists the **outbound and the return** flight (airport, `dd.mm.yyyy` date, times,
airline) plus the number of stay days.

**Live flight prices. Completely static. No backend, no accounts, no API keys, no credit card.**
It runs entirely in the browser on GitHub Pages.

## How it works (no server!)

GitHub Pages can only serve static files, and a browser can't fetch Google Flights directly
(CORS + it's a JavaScript app). So instead:

```
┌──────────────────────────────────────────────────────────────────┐
│  Your browser (GitHub Pages)                                     │
│                                                                  │
│  1. resolve city/country → IATA          (client-side)           │
│  2. build Google Flights' ?tfs= query     (protobuf encoder)      │
│  3. ask a public "reader" to render the   ──────► r.jina.ai       │
│     Google Flights results page                    (free, keyless)│
│  4. parse prices from the returned HTML   (flight parser)         │
│  5. render the tables                     (client-side)           │
└──────────────────────────────────────────────────────────────────┘
```

Everything runs in `docs/app.js`. It is a self-contained JavaScript port of the
[`fast-flights`](https://github.com/AWeirdDev/flights) library:

- **Protobuf encoder** — builds the `?tfs=` parameter Google Flights expects
  (byte-identical to the Python library; verified against known values).
- **Reader fetch** — asks a public reader service (`https://r.jina.ai/`, free and
  key-less) to fetch and render the Google Flights results page server-side, so CORS and
  Google's JavaScript don't matter. The reader returns the rendered HTML with CORS enabled.
  The same query works on any Google domain, so if the reader blocks one
  (e.g. *"anonymous access to www.google.com blocked"*), the app automatically tries the
  next domain in `FLIGHT_GOOGLE_HOSTS` until it gets real flight data.
- **Parser** — extracts the flight data (`AF_initDataCallback` / `ds:1` payload) from that
  HTML and maps it to itineraries, prices and airlines. It reads **every** itinerary list in
  the payload (the nonstop list *and* the connecting/"best" list), because the cheapest flight
  is frequently only in one of them (the `fast-flights` library reads just one, so it can miss
  the cheapest). Verified to produce the same results as the Python library, plus the cheaper
  options it misses.
- **Reader rate limiter** — the key-less reader serves roughly **20 lookups per rolling minute**
  per visitor and answers `HTTP 429` beyond that (one lookup = one rendered Google Flights page).
  Instead of firing until it breaks, every reader request is admitted through a rolling-window
  queue (`READER_MAX_PER_MINUTE`, default 18/min) and a `429` adds a short penalty and is retried
  with patience, so a big sweep finishes instead of failing. The progress line shows the wait and
  the estimated time; a free reader API key removes the wait almost entirely.

> **No secret is embedded and nothing is exposed.** The reader request and the (already
> public) Google Flights page are the only network calls.

## Use it

Open the GitHub Pages URL, type a country/city/airport, pick your dates and stay, and search.
You can also list several airports or cities directly, separated by commas or spaces —
e.g. `DUS, FRA, HAM` (or `DUS FRA HAM`) — and every listed airport is searched.

## Publish on GitHub Pages

The included workflow `.github/workflows/deploy-pages.yml` deploys `docs/` on every push to
`main`. In the repository go to **Settings → Pages → Source: "GitHub Actions"**.

Your site is live at `https://<user>.github.io/<repo>/`.

## Configuration (all optional)

`docs/config.js`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `FLIGHT_READER` | `https://r.jina.ai/` | The reader/fetcher prefix. |
| `FLIGHT_READER_KEY` | `""` | Optional reader API key — only **raises rate limits**; never required. |
| `FLIGHT_GOOGLE_HOSTS` | `["www.google.co.uk", "www.google.ca", …]` | Google domains tried in order until real flight data is returned. |
| `MAX_SEARCHES` | `80` | Lookup ceiling per search (each lookup = one reader request). It is treated as a **floor** when more airport pairs still need covering, so a country search never silently drops airports, and as the budget for the deeper date sweep. Hard cap: 400. |
| `READER_MAX_PER_MINUTE` | `18` | How many reader lookups may be admitted per rolling minute. The key-less reader starts answering `HTTP 429` somewhere above 20, so requests are queued under this rate instead of being sent and failing. |
| `RETURN_FETCH_LIMIT` | `16` | Minimum number of return-direction lookups spent on the displayed flights. It grows with `MAX_SEARCHES` (up to a quarter of it), since return lookups share the same per-minute quota as the date sweep. |
| `SEARCH_CONCURRENCY` | `3` | How many reader requests may be in flight at once (the rate limiter still paces them). |
| `SEARCH_TIME_BUDGET_MS` | `900000` | Hard stop: show partial results after this long. |

Visitors can override the reader, add their own key, or change the lookup cap from the in-page
**⚙️ Data source settings** panel (saved in their browser only).

## Local development

Any static server works — there is no build step:

```bash
python -m http.server 8000 --directory docs
# then open http://127.0.0.1:8000/
```

## Limitations

- **No official Google Flights API exists.** This uses a public reader to render the same
  page a browser would, then parses it. Google may occasionally show a consent/verification
  page, and the free reader is rate-limited or may block a given Google domain for a while —
  the app reports both clearly and falls back to other Google domains. Retrying usually works.
- **Complete airport coverage.** Every airport the input resolves to is searched — a country
  expands to all of its commercial airports (e.g. Germany → 30 airports) and **every**
  origin→destination pair is looked up, so the real cheapest departure airport is found even
  when it isn't the country's main hub. Multiple airports/cities can also be listed directly
  (`DUS, FRA, HAM`, `DUS FRA HAM`, `Frankfurt, Munich`). Cities that have several hubs (London,
  Paris, New York, …) expand to all of them.
- **Sampled dates, honest reporting.** The free reader's ~20 lookups/minute makes a full
  day-by-day sweep of a multi-airport month impossible, so the lookup budget is spent in two
  passes, in priority order (airport pairs → stay lengths → calendar days):
  1. **Broad pass** — *every* route (airport pair × stay length) is looked up on a few
     spread-out days of the window, so no airport and no stay length is ever skipped.
  2. **Deep pass** — the routes that looked cheapest get more days. A route whose whole
     remaining calendar fits in the leftover budget gets **every day**; otherwise it gets a
     share and so do the next-cheapest routes, so one badly-ranked route can't swallow the
     budget. Missing days are visited in **bisection order** (the middle of the window first,
     then the middles of the halves, …), so partial coverage is spread evenly and no stretch of
     the calendar is left unchecked.
  "Sampled days" stops after the broad pass (faster). The result header always states exactly
  what was covered (`Coverage: N/M airport pairs · N/M dates · N/M stay lengths`, plus which
  routes had every day swept), the per-airport table marks airports that weren't checked, and
  raising the lookup budget in ⚙️ settings buys more date coverage. Expect a 10-airport,
  month-long "every day" search to take **4–6 minutes** key-less (~80 lookups + ~16 return
  lookups at 18/minute); paste a free reader API key to make it much faster.
- **Round-trip detail.** Google's round-trip page returns its round-trip total price but lists
  only the **outbound** itinerary. The app therefore fetches the **return direction separately**
  (one extra lookup per return date, de-duplicated) and shows the cheapest return on that date
  for the same airline when available. Return lookups share the per-minute quota, so they are
  spent on the flights actually displayed — the headline picks, the top of the ranked list and
  the per-airport/per-date cheapest — up to `RETURN_FETCH_LIMIT`. Rows beyond that still show the
  return **date** and say that times/airline are unavailable. The price shown is always Google's
  own round-trip total. Open-jaw totals are estimated from two separate one-ways.
- **Every flight shows both directions** in a fixed order: departure airport → departure date →
  departure &amp; arrival time → airline → stay days (outbound), then the same for the return.
  All dates are shown as `dd.mm.yyyy`.
- **Direct-only.** Tick *Direct flights only (nonstop)* to restrict every lookup (outbound and
  return) to nonstop itineraries.
- Prices are live estimates only — not bookable through this app.
- City resolution works for major cities (and expands to all of a city's hubs, e.g. London →
  LHR/LGW/STN/LCY); you can also list airports directly (`DUS, FRA, HAM`). An exact IATA code
  always resolves to that single airport.

## Optional: self-hosted Python backend (legacy)

Earlier versions of this app used a Flask backend (`app.py`) that scrapes Google Flights with
`fast-flights` and serves JSON over CORS. That path still works if you prefer to run your own
backend (Docker, Vercel, a VPS, …) — see `Dockerfile`, `requirements.txt` and `vercel.json` —
but it is **no longer required**: the GitHub Pages app above is fully self-contained.

## Example

- From: `New York` or `JFK`
- To: `London` or `LHR`
- Vacation days: `7`
- Optional departure date
