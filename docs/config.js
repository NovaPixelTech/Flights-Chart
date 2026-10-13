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

// Hard cap on how many route/date lookups a single search performs.
// Each lookup is one reader request, so keep this modest on the free tier.
window.MAX_SEARCHES = 12;

// How many reader requests may run at once (be polite to the free service).
window.SEARCH_CONCURRENCY = 3;

// Give up on a search after this many milliseconds (returns partial results).
window.SEARCH_TIME_BUDGET_MS = 90000;
