/*
 * Cheap Flights Finder — configuration
 * ====================================
 *
 * This app is 100% static and runs entirely in the browser (GitHub Pages).
 * There is NO backend and NO API key needed.
 *
 * How it gets live prices without a server:
 *   The browser asks a public "reader" service to fetch and render the
 *   Google Flights results page, then this app parses the flight data out
 *   of the returned HTML. The default reader (r.jina.ai) is free and works
 *   without an account; an optional API key only raises its rate limits.
 *
 * You can override any of these at runtime from the in-page
 * "⚙️ Data source settings" panel (saved in your browser only).
 */

// Reader/fetcher prefix. The target Google Flights URL is appended after it.
window.FLIGHT_READER = "https://r.jina.ai/";

// Optional reader API key (leave blank to stay key-less). Only lifts rate limits.
window.FLIGHT_READER_KEY = "";

// Google domains to try, in order. The reader may block one domain (for
// example "anonymous access to www.google.com blocked") while others still
// work, so the app falls back down this list until it gets real flight data.
window.FLIGHT_GOOGLE_HOSTS = [
  "www.google.co.uk",
  "www.google.ca",
  "www.google.ie",
  "www.google.com.hk",
  "www.google.com",
];

// Lookup ceiling for a single search. Each lookup is one reader request and
// covers one airport pair × one stay length × one calendar day.
//
//   0  = EXHAUSTIVE (default): sweep every airport pair, every stay length and
//        EVERY calendar day in the window, so the reported cheapest option is
//        genuinely the cheapest on offer. Time is not a constraint — the sweep
//        is paced by READER_MAX_PER_MINUTE below and shows an ETA. A 5-airport
//        month-long search is ~620 lookups ≈ 35 minutes key-less.
//   >0 = spend at most that many lookups. Every airport pair and stay length is
//        still always attempted (the cap is a floor for coverage), and the rest
//        of the budget goes to calendar days, spread evenly across the window.
//
// MAX_SEARCHES_SAFETY is the hard ceiling applied in exhaustive mode, so a
// pathological grid (a whole country → a whole country, month-long, wide stay
// range) can't queue tens of thousands of requests. Raise it if you really want
// that; the app always reports exactly what it covered.
window.MAX_SEARCHES = 0;
window.MAX_SEARCHES_SAFETY = 1500;

// How many reader requests may run at once (be polite to the free service).
window.SEARCH_CONCURRENCY = 3;

// The key-less reader serves roughly 20 lookups per rolling minute per visitor
// and answers HTTP 429 beyond that (one lookup = one rendered Google Flights
// page). Requests are queued to stay under this rate instead of failing, and
// the progress line shows the wait plus an ETA. A free reader API key lifts the
// limit a lot; see the ⚙️ settings panel.
window.READER_MAX_PER_MINUTE = 18;

// Minimum number of return-direction lookups for the displayed flights. This
// grows with the lookup ceiling (up to a quarter of it), because each return
// lookup is a reader request that competes with the date sweep for quota.
window.RETURN_FETCH_LIMIT = 16;

// Hard stop for a search in milliseconds; 0 = no time limit (only the Stop
// button ends a run). Partial results are shown either way.
window.SEARCH_TIME_BUDGET_MS = 0;
