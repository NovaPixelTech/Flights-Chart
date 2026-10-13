# Cheap Flights Finder

Web app that finds the **cheapest direct flight** and the **cheapest flight with at most
2 stops** (stopover ≤ 3 hours) between two cities/airports for a vacation of a given length.
Supports country inputs (expands to **every** commercial airport in that country — all of them
are searched), explicit airport lists (`DUS, FRA, HAM`), flexible date windows, stay-length
ranges, open-jaw (different return airport), and an optional **direct-only (nonstop)** filter.
Every result lists the **outbound and the return** flight (airport, `dd.mm.yyyy` date, times,
airline) plus the number of stay days.

By default a search is **exhaustive**: every resolved airport pair, every stay length and **every
single day** of the date window is queried, so the cheapest option reported really is the cheapest
on offer — no sampling that could step over the cheap Sunday. That takes a while on the free
reader (the progress line shows an ETA, a **Stop** button ends it early, and an interrupted run can
be **resumed** after a reload); a free reader API key removes the wait.

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
  with patience, so a big sweep finishes instead of failing. The progress line shows the wait, the
  elapsed time, the plan and the estimated total; a free reader API key removes the wait almost
  entirely.
- **Long runs are survivable** — an exhaustive sweep can run for a long time, so results are
  checkpointed to `localStorage` as they arrive and offered back after a reload (**Resume**,
  which re-runs only the unfinished lookups and restores what was already found). A **Stop**
  button ends a run at any time and renders the partial results. Sweep lookups are also cached in
  memory, so re-running a search never pays the reader twice for the same lookup.

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
| `MAX_SEARCHES` | `0` (exhaustive) | Lookup ceiling per search (each lookup = one reader request and covers one airport pair × one stay length × one calendar day). **`0` means exhaustive**: every airport pair, every stay length and **every day** of the window is swept, so the reported cheapest option really is the cheapest on offer — time is not a shortcut. A positive value caps the sweep; airport pairs and stay lengths are still always all covered (the cap is a **floor** for coverage), and the remaining budget goes to calendar days, spread evenly across the window. Hard cap: 50000. |
| `MAX_SEARCHES_SAFETY` | `1500` | Hard ceiling applied in exhaustive mode, so a pathological grid (whole country → whole country, month-long, wide stay range) can't queue tens of thousands of requests. When it bites, the result header says exactly what was covered and how to raise it. |
| `READER_MAX_PER_MINUTE` | `18` | How many reader lookups may be admitted per rolling minute. The key-less reader starts answering `HTTP 429` somewhere above 20, so requests are queued under this rate instead of being sent and failing. |
| `RETURN_FETCH_LIMIT` | `16` | Minimum number of return-direction lookups spent on the displayed flights. It grows with the lookup ceiling (up to a fifth of it, max 200), since return lookups share the same per-minute quota as the date sweep. |
| `SEARCH_CONCURRENCY` | `3` | How many reader requests may be in flight at once (the rate limiter still paces them). |
| `SEARCH_TIME_BUDGET_MS` | `0` | Hard stop for a search in milliseconds. **`0` = no time limit** (only the Stop button ends a run); partial results are shown either way. |

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
- **Accuracy first: the whole grid, by default.** One *route* = an airport pair × a stay length;
  one *lookup* = a route on one calendar day. With the default ceiling (`0`) the app sweeps the
  **entire grid** — every pair, every stay length, **every day** of the window — so the cheapest
  option it reports really is the cheapest on offer. For the reference case (5 German airports →
  ATH/SKG, 2 stay lengths, December) that is 620 lookups ≈ **35–40 minutes** key-less; keep the
  tab open (progress is checkpointed and a reload offers to **resume**, skipping finished
  lookups). "**Sampled days**" is the explicit fast path: 4 spread-out days, no deep pass.
  If the grid is bigger than the budget (a positive ceiling, or the `MAX_SEARCHES_SAFETY` cap),
  coverage is trimmed **in calendar days only** — never airport pairs or stay lengths — and the
  priority order is: (1) **broad pass** over every route on spread-out days, then (2) **deep
  pass** over the remaining days for the routes that looked cheapest (a route whose whole
  remaining calendar fits gets every day; otherwise it gets a share, so one badly-ranked route
  can't swallow the budget; missing days are visited in **bisection order** so partial coverage
  is spread evenly). The result header always states exactly what was covered
  (`Coverage: N/M airport pairs · N/M dates · N/M stay lengths`), and when everything fitted it
  states that the sweep was **exhaustive** and that the cheapest option listed is the cheapest on
  offer. Raise the lookup budget in ⚙️ settings to cover more; paste a free reader API key to
  make any of it much faster.
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
