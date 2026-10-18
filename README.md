# Cheap Flights Finder

Web app that finds the **cheapest direct flight** and the **cheapest flight with at most
2 stops** (stopover ≤ 3 hours) between two cities/airports for a vacation of a given length.
Each trip can be priced as a **single round-trip ticket** or as **two separately-booked
one-ways** (the cheapest one-way out plus the cheapest one-way back — often cheaper, because it
can mix airlines), or **both at once** and shown in their own sections so the two booking styles
are never conflated.
Supports country inputs (expands to **every** commercial airport in that country — all of them
are searched), explicit airport lists (`DUS, FRA, HAM`), flexible date windows, stay-length
ranges, open-jaw (different return airport), and an optional **direct-only (nonstop)** filter.
Every result lists the **outbound and the return** flight (airport, `dd.mm.yyyy` date with the
weekday, times, airline) plus the number of stay days. The results also carry a small card that
**cross-checks the cheapest options on Google Flights (where Gotogate is listed), Kiwi.com and
Skyscanner**.

By default a search is **exhaustive**: every resolved airport pair, every stay length and **every
departure date that fits the window** is queried, so the cheapest option reported really is the
cheapest on offer — no sampling that could step over the cheap Sunday. That takes a while on the
free reader, so a run is meant to happen **in the background**: keep using your machine, the tab
icon spins and the tab title shows the progress, and a **browser notification** tells you when the
results are ready. Stopping early needs a deliberate **two-click confirmation**, and an interrupted
run can be **resumed** after a reload; a free reader API key removes the wait.

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
  button ends a run at any time and renders the partial results — it takes a **second click** to
  confirm (the first click only arms it and offers *Keep searching*), so a long sweep can't be
  killed by a stray tap. Sweep lookups are also cached in memory, so re-running a search never
  pays the reader twice for the same lookup.
- **Built for the background** — a sweep is designed to be left alone: the favicon spins while it
  runs and turns into a green check when it finishes, the tab title carries the live lookup count
  and then the finished result (it reverts to normal once you return to the tab), and a
  **browser notification** (permission is requested when you press *Search*, and can be triggered
  again from ⚙️ settings) announces the finished search with the cheapest option found. Because
  browsers throttle hidden tabs hard, an inaudible ~20 Hz keep-alive tone plays while the tab is
  hidden (it is ~-55 dBFS, i.e. silent on any speaker or headphone) so the sweep keeps its full
  pace; both the notification and the keep-alive can be turned off in ⚙️ settings.
- **A catchy animated icon** — the brand mark is an animated paper plane (SVG in the header, a
  static `docs/favicon.svg` for the tab when idle, and a canvas-painted animated plane/check
  favicon while a search runs). Animation only runs while a search is active, and it is disabled
  under `prefers-reduced-motion`.
- **Cross-check on other sites** — under the results a card carries **one row per booking way**
  (round-trip, and two separate one-ways), each built from the **cheapest option found** for that
  way (its route, dates and one adult). Every row links **Google Flights** — whose own result list
  is where the travel agents, **Gotogate** included, appear under *Booking options* — plus
  **Kiwi.com** and **Skyscanner** (prefilled searches), and **Gotogate** itself (home page only: it
  has no prefillable search URL — see
  [Cross-check on other sites](#cross-check-on-other-sites-google-flights-kiwicom-skyscanner-gotogate)).
  These are plain outbound links: nothing is fetched from those sites, no key is used, and the app
  still makes **only** the reader call described above.

> **No secret is embedded and nothing is exposed.** The reader request and the (already
> public) Google Flights page are the only network calls.

## Use it

Open the GitHub Pages URL, type a country/city/airport, pick your dates and stay, and search.
You can also list several airports or cities directly, separated by commas or spaces —
e.g. `DUS, FRA, HAM` (or `DUS FRA HAM`) — and every listed airport is searched.

Two input rules keep the form from being filled in wrongly:

- **The From/To fields are capitals-only.** Whatever you type (or paste) is turned into CAPITAL
  letters as you go — `dus, fra` becomes `DUS, FRA`, `germany` becomes `GERMANY` — and the same
  normalisation is applied to the submitted search, so resolution, hints and lookups always see
  one casing. (`text-transform: uppercase` also keeps the *display* capital for autofill/paste,
  and the mobile keyboard opens in caps mode.)
- **The two date fields are the two ends of one window, so they cannot contradict each other.**
  Picking a departure date (*Date window from*) immediately re-fills the return end
  (*Date window to*) with **departure + the longest stay**, and the return calendar then only
  offers days **after** the departure — earlier days *and* earlier months are greyed out and
  cannot be selected. Symmetrically, the departure calendar is capped by the return end, and a
  return end you picked yourself is never overwritten while it is still valid. So a departure of
  `01.12.2026` gives a return end of `08.12.2026` with a 7-day maximum stay — never a month or a
  date before the departure.

## The date window covers the whole trip (default)

**Date window applies to → *Whole trip* (default).** Every flight listed both **departs and
returns inside the window you set**. The stay length therefore decides the return date, and a
departure that could not return in time is neither searched nor listed — so a result can never
fall outside the dates you asked for. Example: window `06.12.2026 – 13.12.2026`, stay 6–7 days →
only `06.12` (stay 6 and 7) and `07.12` (stay 6) can still return by `13.12`; `08.12` onward is
impossible and is skipped (which also saves reader quota). The result header states this in plain
language, e.g. *"Trip window: every listed flight departs and returns inside … so departures run
…"*.

**Date window applies to → *Departure date only*.** Opt in to the looser rule: the outbound must
be inside the window, but the return may land after it. Use it when you only care about when you
leave.

If a stay cannot fit the window at all (e.g. a 20-day stay in a 8-day window), the app says so
instead of quietly returning nothing, and suggests widening the window, shortening the stay, or
switching to *Departure date only*.

## Cross-check on other sites (Google Flights, Kiwi.com, Skyscanner, Gotogate)

The app prices from Google Flights, and Google's own result list is also where the travel agents —
**Gotogate** among them — appear: select a flight there and its **Booking options** list them. So
the results carry a **"Compare on other sites"** card with **one row per booking way**, each row
built from the **cheapest option the sweep found** for that way (its route, dates and one adult):

| Link | What it does |
| --- | --- |
| **Google Flights** (`round-trip`) | Opens Google's result list for the exact round-trip search — the same `?tfs=` protobuf the app itself fetched, e.g. `https://www.google.com/travel/flights?tfs=…&hl=en&curr=EUR`. |
| **Google Flights** (`out` / `back`) | A *two separate one-ways* or *open-jaw* cheapest option is two one-way tickets, so it gets one link per leg, each with that leg's route and date. |
| **Kiwi.com** | Opens a prefilled search: `https://www.kiwi.com/deep?from=DUS&to=ATH&departure=2026-12-06&return=2026-12-12&adults=1&lang=en&currency=EUR`. For a one-way (or each leg of a two-one-way/open-jaw option) the `return=` parameter is omitted, which makes Kiwi search a one-way. |
| **Skyscanner** | Opens a prefilled search: `https://www.skyscanner.net/transport/flights/dus/ath/261206/261212/?adults=1&adultsv2=1`. Dates are `YYMMDD` path segments; a one-way uses a single date segment; the direct-only filter adds `preferdirects=true`. |
| **Gotogate** | Opens `https://www.gotogate.com/` — its **home page**, with no prefilled search. |

**Why Gotogate has no prefilled link.** Gotogate (like its siblings Mytrip/BudgetAir, all part of
Etraveli Group) is a JavaScript single-page app whose search is driven by a **server-issued
selection key** obtained through a GraphQL call — the only URL parameters its client code reads are
affiliate/UTM ones, never route or dates. Every candidate deep link was tested against the live
site and fails: `/searching-for-flights?...` answers
`{"message":"Search parameters invalid. No flight-routes requested."}`, and `/start`, `/result`,
`/flights/DUS/ATH`, `/rf/flights/dus-ath` all return `404`. On top of that, Gotogate serves
**`HTTP 403 Access Denied`** (Akamai) to non-browser clients, so a static page could never query it
directly anyway. A plain home-page link is the honest maximum — you re-enter the route and dates
there. The **Google Flights** links above are the practical way to reach Gotogate's price, since
Gotogate is one of the booking options Google lists.

**No key, no scrape, no server.** Every link is an ordinary outbound link opened in a new tab
(`target="_blank"` + `rel="noopener noreferrer"`). Nothing is fetched from those sites, so the
app's only network call remains the reader request described above, and the page stays 100 %
static. The card's own note states that prices on those sites are shown in **their** currency and
may differ from Google's.

> **If you need Gotogate's price shown *inside* the app**, the only route is a server-side proxy
> with a paid API (e.g. SerpApi's Google Flights `booking_options`, which lists OTA prices such as
> Gotogate/Mytrip/BudgetAir/Kiwi for a pinned itinerary). That needs a key and a backend, so it
> does **not** belong in the static GitHub Pages app — it would fit the legacy Flask backend
> (`app.py`) instead.

## Install it on your phone's home screen

The app ships home-screen icons, so "Add to Home Screen" gives you a real app tile with the brand
mark instead of a screenshot:

- **iPhone / iPad (Safari).** Open the site, tap **Share** → **Add to Home Screen** → **Add**.
  It launches full-screen (no Safari bars) and uses `apple-touch-icon.png` (180×180 @3x, plus
  152×152 and 120×120 variants) — the opaque, full-bleed plane mark in `docs/`.
- **Android (Chrome).** Open the site, tap **⋮** → **Add to Home screen** / **Install app**. It
  uses `docs/manifest.json` (`icon-192.png`, `icon-512.png`, standalone display).
- **Desktop.** Chrome/Edge "Install" and pinned tabs use the same icons.

> **One platform limit, stated plainly:** iOS and Android do **not** animate home-screen icons —
> the tile is always a static image, so no web app can animate there. The animated plane (header
> logo + spinning/check tab favicon) therefore lives *inside* the app, and the home-screen tile
> uses a matching static frame of the same artwork. On iOS, notifications additionally only work
> for the installed home-screen app (iOS 16.4+), not for a plain Safari tab — another reason to
> install it.

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
| `MAX_SEARCHES` | `0` (exhaustive) | Lookup ceiling per search (each lookup = one reader request and covers one airport pair × one stay length × one departure date). **`0` means exhaustive**: every airport pair, every stay length and **every departure date that fits the window** is swept, so the reported cheapest option really is the cheapest on offer — time is not a shortcut. A positive value caps the sweep; airport pairs and stay lengths are still always all covered (the cap is a **floor** for coverage), and the remaining budget goes to departure dates, spread evenly across the window. Hard cap: 50000. |
| `MAX_SEARCHES_SAFETY` | `1500` | Hard ceiling applied in exhaustive mode, so a pathological grid (whole country → whole country, month-long, wide stay range) can't queue tens of thousands of requests. When it bites, the result header says exactly what was covered and how to raise it. |
| `READER_MAX_PER_MINUTE` | `18` | How many reader lookups may be admitted per rolling minute. The key-less reader starts answering `HTTP 429` somewhere above 20, so requests are queued under this rate instead of being sent and failing. |
| `RETURN_FETCH_LIMIT` | `16` | Minimum number of return-direction lookups spent on the displayed flights. It grows with the lookup ceiling (up to a fifth of it, max 200), since return lookups share the same per-minute quota as the date sweep. |
| `SEARCH_CONCURRENCY` | `3` | How many reader requests may be in flight at once (the rate limiter still paces them). |
| `SEARCH_TIME_BUDGET_MS` | `0` | Hard stop for a search in milliseconds. **`0` = no time limit** (only the Stop button ends a run); partial results are shown either way. |

Visitors can override the reader, add their own key, change the lookup cap, and turn the
**finish notification** or the **background keep-alive** on and off from the in-page
**⚙️ Data source settings** panel (saved in their browser only). The same panel shows whether
notifications are granted, blocked or unsupported, with a button to ask again.

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
  one *lookup* = a route on one departure date. With the default ceiling (`0`) the app sweeps the
  **entire grid** — every pair, every stay length, **every departure date that fits the window** —
  so the cheapest option it reports really is the cheapest on offer. For the reference case (5
  German airports → ATH/SKG, 2 stay lengths, December, whole-trip window) that is 490 lookups ≈
  **25–30 minutes** key-less (fewer than the looser departure-only rule, because departures that
  could not return inside the window are skipped); the run is meant to happen in the
  **background** — progress is checkpointed, a reload offers to **resume**, and a browser
  notification reports the finished search. "**Sampled days**" is the explicit fast path: 4
  spread-out days, no deep pass.
  If the grid is bigger than the budget (a positive ceiling, or the `MAX_SEARCHES_SAFETY` cap),
  coverage is trimmed **in departure dates only** — never airport pairs or stay lengths — and the
  priority order is: (1) **broad pass** over every route on spread-out dates, then (2) **deep
  pass** over the remaining dates for the routes that looked cheapest (a route whose whole
  remaining calendar fits gets every date; otherwise it gets a share, so one badly-ranked route
  can't swallow the budget; missing dates are visited in **bisection order** so partial coverage
  is spread evenly). The result header always states exactly what was covered
  (`Coverage: N/M airport pairs · N/M departure dates · N/M stay lengths`), and when everything
  fitted it states that the sweep was **exhaustive** and that the cheapest option listed is the
  cheapest on offer. Raise the lookup budget in ⚙️ settings to cover more; paste a free reader API
  key to make any of it much faster.
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
  All dates are shown as `dd.mm.yyyy` **preceded by the abbreviated weekday** (e.g.
  `Sun 06.12.2026`, in your browser's language), which makes the "cheap Sunday" jumps in a price
  sweep easy to spot.
- **Direct-only.** Tick *Direct flights only (nonstop)* to restrict every lookup (outbound and
  return) to nonstop itineraries.
- **Background searches have browser limits.** A sweep keeps its full pace while the tab is
  hidden on desktop browsers (helped by the inaudible keep-alive audio, which you can switch off).
  Phones throttle or **suspend** background tabs entirely — iOS stops JavaScript in a backgrounded
  tab, so the run pauses there and continues when you return to it (nothing is lost: progress is
  checkpointed, and the *Resume* offer skips what was already done). Notifications also need the
  page to be added to the home screen on iOS.
- Prices are live estimates only — not bookable through this app. Booking-site comparisons
  (Google Flights, Kiwi.com, Skyscanner, Gotogate) are **outbound links only** — see
  [Cross-check on other sites](#cross-check-on-other-sites-google-flights-kiwicom-skyscanner-gotogate);
  no OTA price is fetched or shown inline (that would need a keyed backend API).
- City resolution works for major cities (and expands to all of a city's hubs, e.g. London →
  LHR/LGW/STN/LCY); you can also list airports directly (`DUS, FRA, HAM`). An exact IATA code
  always resolves to that single airport.

## Optional: self-hosted Python backend (legacy)

Earlier versions of this app used a Flask backend (`app.py`) that scrapes Google Flights with
`fast-flights` and serves JSON over CORS. That path still works if you prefer to run your own
backend (Docker, Vercel, a VPS, …) — see `Dockerfile`, `requirements.txt` and `vercel.json` —
but it is **no longer required**: the GitHub Pages app above is fully self-contained.

### ⚠️ The Python backend does **not** have the "ticket type" feature yet

The static app (`docs/`) gained a **Round-trip vs. two separate one-ways** comparison, but
`app.py` + `templates/index.html` were intentionally left untouched (it is the legacy path).
If you ever want the Flask backend to match, here is exactly what to change — the static app is
the reference implementation, so mirror it rather than inventing a new design.

**Concept.** A *round-trip ticket* is a single booking priced from Google's round-trip response.
*Two separate one-ways* is the sum of the cheapest one-way in each direction (often two different
airlines, so it can be cheaper). They are different products and must never be added or compared
as if they were the same thing.

**Backend (`app.py`)**

- Read a new request field in `api_search()`: `ticket_type` ∈ `"roundtrip" | "oneway" | "both"`
  (default `"roundtrip"` so existing callers are unaffected).
- For each `(origin, dest, outbound, stay)` slot the loop already computes, keep the existing
  round-trip call for `roundtrip`/`both`, and additionally, for `oneway`/`both`, call
  `search_flights(o, d, outbound, None, …)` and `search_flights(d, o, ret, None, …)` (i.e. two
  **one-way** searches — `return_date=None`). Sum the two cheapest, tag the merged record with
  `ticket_type: "oneway"` (or `"open_jaw"` for the existing open-jaw estimate), and append it.
  A one-way combo is **two** `search_flights` calls, so count it against `MAX_SEARCHES` as two.
- Tag round-trip records with `ticket_type: "roundtrip"`.
- In the JSON response, add `ticket_type`, plus `cheapest_roundtrip` / `cheapest_roundtrip_direct`
  and `cheapest_oneway` / `cheapest_oneway_direct` (filter `all_results` by `ticket_type`, then by
  nonstop), and `has_roundtrip_results` / `has_oneway_results`, mirroring
  `docs/app.js` → `runSearch()` (search for `roundTripOpts`, `oneWayOpts`).
- "Direct" for a one-way combo means **both** legs are nonstop (`stops == 0` and
  `return_stops == 0`), matching `docs/app.js` → `_isDirectOption()`.

**Frontend (`templates/index.html`)**

- Add a `ticket_type` `<select>` next to the existing `open_jaw` control (same three options,
  default `both`), include it in the `fetch("/api/search", …)` body, and render the two sections
  ("Round-trip ticket — one booking" / "Two separate one-way tickets — two bookings") plus the
  Type column, exactly like `renderResults()` / `_ticketLabel()` in `docs/app.js`.

**Caveat.** `app.py` runs synchronously under a hard `MAX_SEARCHES` (default 40) and
`SEARCH_TIME_BUDGET_S` (default 100s) budget on a free host; `"both"` roughly doubles the work,
so consider leaving the backend default at `"roundtrip"` and letting the client opt in.

## Example

- From: `New York` or `JFK`
- To: `London` or `LHR`
- Vacation days: `7`
- Optional departure date
