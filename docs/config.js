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

// Lookup ceiling for a single search. This is how many route/date lookups the
// sweep may perform. It is treated as a FLOOR when more airports still need
// covering (every resolved airport pair is always attempted), and as a ceiling
// for deep calendar sweeps. Each lookup is one reader request, so a big
// multi-airport "every day" search does take a while — see
// READER_MAX_PER_MINUTE below. Raise it for more exhaustive date coverage,
// lower it to be quick.
window.MAX_SEARCHES = 80;

// How many reader requests may run at once (be polite to the free service).
window.SEARCH_CONCURRENCY = 3;

// The key-less reader serves roughly 20 lookups per rolling minute per visitor
// and answers HTTP 429 beyond that (one lookup = one rendered Google Flights
// page). Requests are queued to stay under this rate instead of failing, so a
// 80-lookup sweep takes about 4–5 minutes. A free reader API key lifts the
// limit; see the ⚙️ settings panel.
window.READER_MAX_PER_MINUTE = 18;

// Minimum number of return-direction lookups for the displayed flights. This
// grows with the lookup ceiling (up to a quarter of it), because each return
// lookup is a reader request that competes with the date sweep for quota.
window.RETURN_FETCH_LIMIT = 16;

// Hard stop for a search (partial results are returned instead).
window.SEARCH_TIME_BUDGET_MS = 900000;
