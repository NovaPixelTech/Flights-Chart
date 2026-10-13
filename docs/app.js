/* ================================================================== *
 *  ✈️  Cheap Flights Finder — 100% static GitHub Pages app
 * ================================================================== *
 *  No backend. No accounts. No API keys required.
 *
 *  How it works:
 *   1. Airport/country resolution happens here in the browser.
 *   2. We build Google Flights' `?tfs=` query parameter locally
 *      (a JavaScript port of fast-flights' protobuf encoder).
 *   3. A public "reader" service fetches & renders the Google Flights
 *      results page server-side (so CORS / JavaScript don't matter),
 *      and returns the rendered HTML to us.
 *   4. We parse the flight data straight out of that HTML
 *      (a JavaScript port of fast-flights' parser).
 *
 *  Everything below runs client-side; nothing is sent anywhere except
 *  the reader request and the (public) Google Flights page.
 * ================================================================== */

"use strict";

/* ------------------------------------------------------------------ *
 *  Airport data
 * ------------------------------------------------------------------ */
const AIRPORTS_URLS = [
  "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json",
  "https://cdn.jsdelivr.net/gh/mwgg/Airports@master/airports.json",
];

// Prefer large hubs when multiple airports match a city
const MAJOR_AIRPORTS = {
  "new york": ["JFK", "LGA", "EWR"],
  "london": ["LHR", "LGW", "STN", "LCY"],
  "paris": ["CDG", "ORY"],
  "tokyo": ["NRT", "HND"],
  "los angeles": ["LAX"],
  "san francisco": ["SFO"],
  "chicago": ["ORD", "MDW"],
  "miami": ["MIA"],
  "dubai": ["DXB"],
  "singapore": ["SIN"],
  "hong kong": ["HKG"],
  "amsterdam": ["AMS"],
  "frankfurt": ["FRA"],
  "madrid": ["MAD"],
  "barcelona": ["BCN"],
  "rome": ["FCO", "CIA"],
  "milan": ["MXP", "LIN"],
  "berlin": ["BER"],
  "munich": ["MUC"],
  "istanbul": ["IST", "SAW"],
  "athens": ["ATH"],
  "bangkok": ["BKK"],
  "seoul": ["ICN", "GMP"],
  "sydney": ["SYD"],
  "melbourne": ["MEL"],
  "toronto": ["YYZ"],
  "vancouver": ["YVR"],
  "mexico city": ["MEX"],
  "sao paulo": ["GRU"],
  "rio de janeiro": ["GIG"],
  "buenos aires": ["EZE"],
  "delhi": ["DEL"],
  "mumbai": ["BOM"],
  "beijing": ["PEK", "PKX"],
  "shanghai": ["PVG", "SHA"],
};

// When the user enters a COUNTRY, expand to these commercial airports
const COUNTRY_AIRPORTS = {
  "germany": [
    "BER", "FRA", "MUC", "HAM", "DUS", "CGN", "STR",
    "HAJ", "NUE", "LEJ", "DRS", "BRE", "DTM", "FMO", "PAD", "NRN",
    "HHN", "FMM", "FKB", "SCN", "FDH", "ERF", "RLG", "GWT", "HDF",
    "KSF", "LBC", "MHG", "AOC", "ZQW",
  ],
  "greece": [
    "ATH", "SKG", "HER", "RHO", "CFU", "CHQ", "ZTH", "JMK", "JTR",
    "KGS", "MJT", "SMI", "PVK", "KLX", "GPA", "AXD", "IOA", "JKH",
    "JSI", "PAS", "EFL",
  ],
  "france": ["CDG", "ORY", "LYS", "MRS", "NCE", "TLS", "BOD", "NTE", "LIL", "SXB", "BIQ", "RNS"],
  "italy": ["FCO", "MXP", "LIN", "VCE", "NAP", "BLQ", "PSA", "BGY", "CTA", "PMO", "BRI", "TRN", "GOA", "FLR"],
  "spain": ["MAD", "BCN", "AGP", "PMI", "ALC", "VLC", "SVQ", "BIO", "LPA", "TFS", "ACE", "IBZ"],
  "united kingdom": ["LHR", "LGW", "STN", "LTN", "MAN", "EDI", "BHX", "GLA", "BRS", "NCL", "LPL", "BFS", "LCY"],
  "uk": ["LHR", "LGW", "STN", "LTN", "MAN", "EDI", "BHX", "GLA", "BRS", "NCL", "LPL", "BFS", "LCY"],
  "netherlands": ["AMS", "RTM", "EIN", "GRQ"],
  "portugal": ["LIS", "OPO", "FAO", "FNC"],
  "austria": ["VIE", "SZG", "INN", "GRZ", "LNZ"],
  "switzerland": ["ZRH", "GVA", "BSL"],
  "belgium": ["BRU", "CRL", "ANR"],
  "poland": ["WAW", "KRK", "GDN", "WRO", "KTW", "POZ"],
  "turkey": ["IST", "SAW", "AYT", "ESB", "ADB", "BJV", "DLM"],
  "united states": ["JFK", "EWR", "LGA", "LAX", "SFO", "ORD", "MIA", "ATL", "DFW", "SEA", "BOS", "IAD", "DEN", "LAS"],
  "usa": ["JFK", "EWR", "LGA", "LAX", "SFO", "ORD", "MIA", "ATL", "DFW", "SEA", "BOS", "IAD", "DEN", "LAS"],
};

// Minimal fallback if the remote airports dataset is unreachable
const FALLBACK_AIRPORTS = [
  ["JFK", "John F. Kennedy International", "New York", "US"],
  ["LAX", "Los Angeles International", "Los Angeles", "US"],
  ["LHR", "Heathrow", "London", "GB"],
  ["CDG", "Charles de Gaulle", "Paris", "FR"],
  ["NRT", "Narita", "Tokyo", "JP"],
  ["SFO", "San Francisco International", "San Francisco", "US"],
  ["ORD", "O'Hare", "Chicago", "US"],
  ["DXB", "Dubai International", "Dubai", "AE"],
  ["SIN", "Changi", "Singapore", "SG"],
  ["AMS", "Schiphol", "Amsterdam", "NL"],
];

const AIRPORTS = {};
const CITY_TO_IATA = {};

async function loadAirports() {
  if (Object.keys(AIRPORTS).length) return AIRPORTS;
  const cached = sessionStorage.getItem("flightsfinder-airports");
  if (cached) {
    try {
      buildIndex(JSON.parse(cached));
      return AIRPORTS;
    } catch (e) { /* ignore and refetch */ }
  }
  for (const url of AIRPORTS_URLS) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      buildIndex(data);
      try { sessionStorage.setItem("flightsfinder-airports", JSON.stringify(data)); } catch (e) {}
      return AIRPORTS;
    } catch (e) { /* try next source */ }
  }
  for (const [code, name, city, country] of FALLBACK_AIRPORTS) {
    AIRPORTS[code] = { iata: code, name, city, country };
    (CITY_TO_IATA[city.toLowerCase()] = CITY_TO_IATA[city.toLowerCase()] || []).push(code);
  }
  return AIRPORTS;
}

function buildIndex(data) {
  for (const key in data) {
    const v = data[key] || {};
    const iata = (v.iata || "").trim().toUpperCase();
    if (iata.length !== 3) continue;
    AIRPORTS[iata] = v;
    const city = (v.city || "").trim().toLowerCase();
    if (city) (CITY_TO_IATA[city] = CITY_TO_IATA[city] || []).push(iata);
  }
}

/* Resolve user input (city / country / airport) to one or more IATA codes. */
/** Resolve a single entry (IATA code, city, or country) to airport codes. */
function resolveOneLocation(text) {
  if (!text) return [];
  text = text.trim();
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();

  // Country expansion first: "usa", "USA", "united states" → all its airports
  if (COUNTRY_AIRPORTS[lower]) return COUNTRY_AIRPORTS[lower].slice();

  if (upper.length === 3 && /^[A-Z]{3}$/.test(upper) && AIRPORTS[upper]) {
    return [upper];
  }
  if (MAJOR_AIRPORTS[lower]) return MAJOR_AIRPORTS[lower].slice();
  if (CITY_TO_IATA[lower]) {
    const codes = CITY_TO_IATA[lower];
    const maj = MAJOR_AIRPORTS[lower] || [];
    for (const m of maj) if (codes.includes(m)) return [m];
    return [codes[0]];
  }
  for (const city in CITY_TO_IATA) {
    // Loose substring match, but only for reasonably long inputs — otherwise
    // short codes like "FRA" would match unrelated cities ("san FRAncisco").
    if (lower.length >= 4 && (lower.includes(city) || city.includes(lower))) return [CITY_TO_IATA[city][0]];
  }
  for (const code in AIRPORTS) {
    const name = (AIRPORTS[code].name || "").toLowerCase();
    if (lower && name.includes(lower)) return [code];
  }
  return [];
}

/** Is this input an explicit list rather than one country/city/airport? */
function isExplicitList(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/[,;/+]/.test(raw)) return true;
  // A run of 3-letter IATA codes separated by spaces: "DUS FRA HAM".
  const words = raw.split(/\s+/).filter(Boolean);
  return words.length > 1 &&
    words.every((w) => /^[A-Za-z]{3}$/.test(w) && AIRPORTS[w.toUpperCase()]);
}

/**
 * Resolve the origin/destination field. Accepts one country, city or airport —
 * or an explicit list of them, e.g. "DUS, FRA, HAM" / "DUS FRA HAM" /
 * "Frankfurt, Munich, Berlin". Lists are resolved to the union of their codes.
 */
function resolveLocations(text) {
  if (!text) return [];
  const raw = String(text).trim();
  if (!raw) return [];

  let parts = raw.split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length > 1 &&
        words.every((w) => /^[A-Za-z]{3}$/.test(w) && AIRPORTS[w.toUpperCase()])) {
      parts = words;
    }
  }
  if (parts.length > 1) {
    const out = [];
    for (const part of parts) {
      for (const code of resolveOneLocation(part)) if (out.indexOf(code) === -1) out.push(code);
    }
    return out;
  }
  return resolveOneLocation(raw);
}

function airportInfo(code) {
  const info = AIRPORTS[code] || {};
  return { code, name: info.name, city: info.city, country: info.country };
}

/* ------------------------------------------------------------------ *
 *  Google Flights `?tfs=` protobuf encoder
 * ------------------------------------------------------------------ *
 *  Ported from fast-flights' `querying.py` + generated `flights.proto`.
 * ------------------------------------------------------------------ */
const ENUM_SEAT = { "economy": 1, "premium-economy": 2, "business": 3, "first": 4 };
const ENUM_TRIP = { "round-trip": 1, "one-way": 2, "multi-city": 3 };
const ENUM_PASSENGER = { adult: 1, child: 2, infant_in_seat: 3, infant_on_lap: 4 };

function _varint(n) {
  n = Math.trunc(n);
  const out = [];
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7f);
  return out;
}
function _tag(field, wire) { return _varint((field << 3) | wire); }
function _fieldVarint(field, value) { return _tag(field, 0).concat(_varint(value)); }
function _fieldBytes(field, bytes) { return _tag(field, 2).concat(_varint(bytes.length), bytes); }
function _fieldString(field, str) { return _fieldBytes(field, Array.from(new TextEncoder().encode(str))); }
function _airport(code) { return _fieldString(2, code); }

// message FlightData { date=2, from=13, to=14, max_stops=5, max_layover=18 }
function _flightData({ date, from, to, maxStops, maxLayover }) {
  let b = [];
  b = b.concat(_fieldString(2, date));
  if (maxStops != null) b = b.concat(_fieldVarint(5, maxStops));
  b = b.concat(_fieldBytes(13, _airport(from)));
  b = b.concat(_fieldBytes(14, _airport(to)));
  if (maxStops != null && maxStops > 0 && maxLayover != null) {
    b = b.concat(_fieldVarint(18, maxLayover));
  }
  return b;
}

// message Info { data=3, passengers=8 (packed), seat=9, trip=19 }
function _info({ flightDataList, seat, trip, passengers }) {
  let b = [];
  for (const fd of flightDataList) b = b.concat(_fieldBytes(3, fd));
  if (passengers && passengers.length) {
    let packed = [];
    for (const p of passengers) packed = packed.concat(_varint(p));
    b = b.concat(_fieldBytes(8, packed));
  }
  b = b.concat(_fieldVarint(9, seat));
  b = b.concat(_fieldVarint(19, trip));
  return b;
}

function _base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Build the `tfs` value for a set of legs. */
function buildTfs({ legs, trip, seat = "economy", adults = 1 }) {
  const flightDataList = legs.map((l) => _flightData({
    date: l.date, from: l.from, to: l.to, maxStops: l.maxStops, maxLayover: l.maxLayover,
  }));
  const passengers = [];
  for (let i = 0; i < adults; i++) passengers.push(ENUM_PASSENGER.adult);
  const bytes = _info({
    flightDataList,
    seat: ENUM_SEAT[seat] || 1,
    trip: ENUM_TRIP[trip] || 2,
    passengers,
  });
  return _base64(bytes);
}

/* ------------------------------------------------------------------ *
 *  Reader fetch (public, key-less by default)
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);

function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function currentReader() {
  const typed = ($("readerUrl") && $("readerUrl").value || "").trim();
  let base = typed || (window.FLIGHT_READER || "").trim() || "https://r.jina.ai/";
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  return base.endsWith("/") ? base : base + "/";
}

function currentReaderKey() {
  const typed = ($("readerKey") && $("readerKey").value || "").trim();
  return typed || (window.FLIGHT_READER_KEY || "").trim();
}

function currentMaxSearches() {
  const typed = parseInt(($("maxSearches") && $("maxSearches").value) || "", 10);
  const val = Number.isFinite(typed) && typed > 0 ? typed : (window.MAX_SEARCHES || 80);
  return Math.max(1, Math.min(400, val));
}

function _concurrency() {
  return Math.max(1, Math.min(6, window.SEARCH_CONCURRENCY || 3));
}

function googleHosts() {
  const el = $("googleHosts");
  if (el && el.value.trim()) {
    const list = el.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length) return list;
  }
  const cfg = window.FLIGHT_GOOGLE_HOSTS;
  if (Array.isArray(cfg) && cfg.length) return cfg.slice();
  return ["www.google.co.uk", "www.google.ca", "www.google.ie", "www.google.com.hk", "www.google.com"];
}

// Remember the last host that worked so we don't re-probe blocked ones every time.
let _preferredHost = 0;

/* ------------------------------------------------------------------ *
 *  Reader rate limiter
 * ------------------------------------------------------------------ *
 *  The key-less reader serves only ~20 lookups per rolling minute and
 *  answers HTTP 429 beyond that. Rather than firing until it breaks, every
 *  reader request is admitted through this rolling-window queue: once the
 *  window is full we sleep until the oldest request ages out. A 429 (someone
 *  else on the same connection, or a burst) adds a short penalty so the
 *  queue backs off instead of failing the search.
 * ------------------------------------------------------------------ */
const _readerLog = [];
let _readerPenaltyUntil = 0;

function _readerRate() {
  const n = Number(window.READER_MAX_PER_MINUTE);
  return Math.max(2, Math.min(60, Number.isFinite(n) && n > 0 ? n : 18));
}

function _readerThrottledMs() {
  const penalty = _readerPenaltyUntil - Date.now();
  if (penalty > 0) return penalty;
  if (_readerLog.length < _readerRate()) return 0;
  return Math.max(0, 60000 - (Date.now() - _readerLog[0]));
}

async function _readerAdmit() {
  for (;;) {
    const now = Date.now();
    while (_readerLog.length && now - _readerLog[0] > 60000) _readerLog.shift();
    const penalty = _readerPenaltyUntil - now;
    if (penalty > 0) {
      await _sleep(Math.min(penalty, 3000));
      continue;
    }
    if (_readerLog.length < _readerRate()) {
      _readerLog.push(now);
      return;
    }
    await _sleep(Math.max(250, Math.min(60000 - (now - _readerLog[0]) + 120, 4000)));
  }
}

function _readerPenalty(ms) {
  _readerPenaltyUntil = Math.max(_readerPenaltyUntil, Date.now() + ms);
}

async function _readerGet(url, timeoutMs) {
  const headers = { "x-respond-with": "html" };
  const key = currentReaderKey();
  if (key) headers["Authorization"] = "Bearer " + key;

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { headers, signal: ctrl && ctrl.signal, redirect: "follow", cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch the rendered Google Flights page through the reader.
 *
 * Rotates across Google domains: a reader may block one domain (e.g.
 * "anonymous access to www.google.com blocked") while others still work.
 * The first host that returns a page containing real flight data wins, and
 * is remembered for subsequent requests.
 */
async function fetchGoogleFlightsHtml(tfs, currency, timeoutMs = 70000) {
  const hosts = googleHosts();
  const qs = "tfs=" + encodeURIComponent(tfs) + "&hl=en&curr=" + encodeURIComponent(currency);
  let lastErr = null;

  for (let attempt = 0; attempt < hosts.length; attempt++) {
    const idx = (_preferredHost + attempt) % hosts.length;
    const host = hosts[idx];
    const url = currentReader() + `https://${host}/travel/flights?${qs}`;
    try {
      await _readerAdmit(); // stay inside the reader's per-minute quota
      const { ok, status, text } = await _readerGet(url, timeoutMs);
      if (ok && text.indexOf('class="ds:1"') !== -1) {
        _preferredHost = idx; // remember the working host
        return text;
      }
      if (status === 429) {
        // Quota exhausted (per visitor IP, shared with every other tab/app on
        // this connection). Back off — the queue plus _withRetry will retry
        // once the rolling window frees up.
        _readerPenalty(25000);
        const err = new Error(
          "The public reader is rate-limiting (HTTP 429) — it allows about " +
          `${_readerRate()} lookups a minute. The search waits and retries automatically; ` +
          "a free reader API key in ⚙️ settings removes the wait."
        );
        err.status = 429;
        throw err;
      }
      lastErr = new Error(
        `Reader returned ${status} for ${host}${ok ? " (page had no flight data)" : ""}.`
      );
      if (status) lastErr.status = status;
    } catch (e) {
      if (e.status === 429) throw e;
      lastErr = e;
    }
  }
  // Nothing worked — give the user an actionable hint.
  const err = new Error(
    "The reader could not fetch Google Flights from any domain. It may be temporarily " +
    "rate-limiting or blocking anonymous access. Wait a few minutes and retry, or add a " +
    "free reader API key in ⚙️ settings." +
    (lastErr ? `\n\n(Last error: ${lastErr.message})` : "")
  );
  err.status = lastErr && lastErr.status;
  throw err;
}

async function _withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      // Don't retry hard 4xx errors (except 429 rate-limit).
      if (e.status && e.status !== 429 && e.status < 500) throw e;
      if (e.status === 429) {
        _readerPenalty(25000 + i * 5000);
        await _sleep(Math.min(60000, 8000 + i * 8000) + Math.floor(Math.random() * 800));
        if (i >= 3) tries = Math.min(tries + 1, 8); // a rate limit deserves patience
      } else {
        await _sleep(800 * Math.pow(2, i) + Math.floor(Math.random() * 400));
      }
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 *  Parser — ported from fast-flights' `parser.py`
 * ------------------------------------------------------------------ */
function _parseTime(v) {
  const arr = Array.isArray(v) ? v : [];
  const a = arr.length > 0 && arr[0] != null ? arr[0] : 0;
  const b = arr.length > 1 && arr[1] != null ? arr[1] : 0;
  return [a, b];
}

function _findDataScript(doc) {
  for (const s of doc.querySelectorAll("script")) {
    const cls = s.getAttribute("class") || "";
    if (cls === "ds:1" || cls.split(/\s+/).indexOf("ds:1") !== -1) return s;
  }
  for (const s of doc.querySelectorAll("script")) {
    const t = s.textContent || "";
    if (t.indexOf("AF_initDataCallback") !== -1 && t.indexOf("'ds:1'") !== -1) return s;
  }
  return null;
}

/** Extract raw flight options + airline names from rendered Google Flights HTML. */
function parseFlightsFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const script = _findDataScript(doc);

  if (!script) {
    const bodyText = (doc.body && doc.body.textContent || "").toLowerCase();
    if (bodyText.indexOf("before you continue") !== -1 ||
        bodyText.indexOf("unusual traffic") !== -1 ||
        bodyText.indexOf("captcha") !== -1) {
      throw new Error(
        "Google showed a consent/verification page instead of flight results " +
        "(the reader's IP may be flagged right now). Try again in a few minutes."
      );
    }
    throw new Error("Could not find flight data in the returned page (layout may have changed).");
  }

  const js = script.textContent || "";

  // Mirrors: js.split("data:", 1)[1].rsplit(",", 1)[0]
  const at = js.indexOf("data:");
  if (at === -1) throw new Error("Unexpected flight-data format.");
  const after = js.substring(at + 5);
  const lastComma = after.lastIndexOf(",");
  const dataStr = (lastComma >= 0 ? after.substring(0, lastComma) : after).trim();

  if (dataStr.endsWith("errorHasStatus: true")) {
    return { options: [], airlineNames: {}, empty: true };
  }

  let payload;
  try { payload = JSON.parse(dataStr); }
  catch (e) { throw new Error("Could not JSON-parse the flight data."); }

  const airlineNames = {};
  try {
    const airlinesData = payload[7][1][1] || [];
    for (const pair of airlinesData) if (pair) airlineNames[pair[0]] = pair[1];
  } catch (e) { /* metadata is optional */ }

  const options = [];
  const seen = new Set();

  // The payload contains MORE THAN ONE list of itineraries. For a round trip
  // that's typically the nonstop list (payload[2][0]) AND the "best"/connecting
  // list (payload[3][0]); the cheapest flight is often only in the first.
  // (fast-flights reads payload[3][0] alone, which is why it can miss it.)
  const optionLists = [];
  for (const holder of [payload[2], payload[3]]) {
    if (!Array.isArray(holder)) continue;
    for (const cand of holder) {
      if (Array.isArray(cand) && cand.length && _isOptionEntry(cand[0])) {
        optionLists.push(cand);
      }
    }
  }

  for (const list of optionLists) {
    for (const k of list) {
      try {
        const flight = k[0];
        if (!flight || !Array.isArray(flight[2])) continue;
        const price = (k[1] && k[1][0]) ? k[1][0][1] : null;
        if (price == null) continue;
        const airlineCodes = flight[1] || [];
        const legs = [];
        for (const sf of flight[2]) {
          legs.push({
            from: sf[3], from_name: sf[4], to: sf[6], to_name: sf[5],
            dep_date: sf[20], dep_time: _parseTime(sf[8]),
            arr_date: sf[21], arr_time: _parseTime(sf[10]),
            plane: sf[17], duration_min: sf[11],
          });
        }
        if (!legs.length) continue;
        // de-duplicate: the same itinerary can appear in both lists
        const sig = price + "|" + legs
          .map((l) => `${l.from}${l.to}${_dateTime(l.dep_date, l.dep_time)}${_dateTime(l.arr_date, l.arr_time)}`)
          .join(">");
        if (seen.has(sig)) continue;
        seen.add(sig);
        options.push({ price, airline_codes: airlineCodes, legs });
      } catch (e) { /* skip malformed option */ }
    }
  }
  return { options, airlineNames, empty: options.length === 0 };
}

/** Does this payload entry look like `[flight, [[null, price, ...]], ...]`? */
function _isOptionEntry(e) {
  return Array.isArray(e) && Array.isArray(e[0]) && Array.isArray(e[0][2]) && e[0][2].length > 0;
}

/* ------------------------------------------------------------------ *
 *  Formatting helpers
 * ------------------------------------------------------------------ */
function _pad2(n) { return String(n).padStart(2, "0"); }

function _dateObj(d) {
  if (!Array.isArray(d) || d.length < 3) return null;
  return `${d[0]}-${_pad2(d[1])}-${_pad2(d[2])}`;
}
function _dateTime(d, t) {
  const ds = _dateObj(d);
  return ds ? `${fmtDate(ds)} ${_pad2(t[0])}:${_pad2(t[1])}` : "—";
}
function _dtMs(d, t) {
  const ds = _dateObj(d);
  if (!ds) return null;
  const ms = Date.parse(`${ds}T${_pad2(t[0])}:${_pad2(t[1])}:00`);
  return Number.isNaN(ms) ? null : ms;
}
function _layoverMinutes(legs) {
  const lays = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const arr = _dtMs(legs[i].arr_date, legs[i].arr_time);
    const dep = _dtMs(legs[i + 1].dep_date, legs[i + 1].dep_time);
    if (arr != null && dep != null) lays.push(Math.round((dep - arr) / 60000));
  }
  return lays;
}

function formatDuration(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + "h " + m + "m";
}
/** ISO date (YYYY-MM-DD / YYYY-MM-DD HH:MM) → DD.MM.YYYY. */
function fmtDate(iso) {
  const s = String(iso || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

function toFlightDict(opt, ctx, airlineNames) {
  const legs = opt.legs.map((l) => ({
    from: l.from, from_name: l.from_name, to: l.to, to_name: l.to_name,
    departure: _dateTime(l.dep_date, l.dep_time),
    arrival: _dateTime(l.arr_date, l.arr_time),
    duration_min: l.duration_min, plane: l.plane,
  }));
  const lays = _layoverMinutes(opt.legs);
  const totalDur = opt.legs.reduce((s, l) => s + (l.duration_min || 0), 0) +
                   lays.reduce((s, x) => s + x, 0);
  return {
    price: opt.price,
    airlines: opt.airline_codes.map((c) => airlineNames[c] || c),
    stops: Math.max(0, opt.legs.length - 1),
    legs,
    layovers_min: lays,
    total_duration_min: totalDur,
    origin_airport: ctx.origin,
    dest_airport: ctx.dest,
    return_airport: ctx.returnAirport || ctx.origin,
    outbound_date: ctx.outbound,
    return_date: ctx.ret || null,
    stay_days: ctx.stay != null ? ctx.stay : null,
    max_stops: ctx.maxStops != null ? ctx.maxStops : null,
    open_jaw: !!ctx.openJaw,
  };
}

/* ------------------------------------------------------------------ *
 *  Date helpers
 * ------------------------------------------------------------------ */
const MS_DAY = 86400000;

function addDays(d, n) {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}
function isoLocal(d) {
  return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
}
function parseISODate(s) {
  if (!s) return null;
  const parts = String(s).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
/** `count` evenly-spaced ISO dates across [start, end] (inclusive). */
function spreadDates(start, end, count) {
  const span = Math.round((end - start) / MS_DAY);
  if (count <= 1 || span <= 0) return [isoLocal(start)];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(isoLocal(addDays(start, Math.round((i * span) / (count - 1)))));
  }
  return Array.from(new Set(out));
}

/**
 * Reorder dates so partial coverage is spread evenly across the list instead of
 * leaving a contiguous stretch unchecked: the middle of a range first, then the
 * middles of the two halves, and so on (a breadth-first bisection).
 */
function bisectionOrder(dates) {
  const out = [];
  const queue = [[0, dates.length - 1]];
  while (queue.length) {
    const [lo, hi] = queue.shift();
    if (lo > hi) continue;
    const mid = (lo + hi) >> 1;
    out.push(dates[mid]);
    queue.push([lo, mid - 1], [mid + 1, hi]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Search orchestration
 * ------------------------------------------------------------------ */

/* One-way lookups are cached by route+date+stops so return fetches that
 * repeat (different outbound dates often share a return date) cost nothing. */
const _oneWayCache = new Map();

async function fetchOneWayOptions(from, to, date, maxStops, currency) {
  const key = [from, to, date, maxStops, currency].join("|");
  if (_oneWayCache.has(key)) return _oneWayCache.get(key);
  const p = (async () => {
    const tfs = buildTfs({
      legs: [{ date, from, to, maxStops, maxLayover: 180 }],
      trip: "one-way", currency,
    });
    const html = await _withRetry(() => fetchGoogleFlightsHtml(tfs, currency));
    const parsed = parseFlightsFromHtml(html);
    return parsed.options.map((o) => toFlightDict(o, {
      origin: from, dest: to, returnAirport: from,
      outbound: date, ret: null, stay: null, openJaw: false,
    }, parsed.airlineNames));
  })().catch(() => []); // return details are best-effort — never fail the task
  _oneWayCache.set(key, p);
  return p;
}

/** Attach the best-matching return itinerary (same airline, else cheapest). */
function attachReturnLeg(f, returnOptions, maxStops) {
  if (!returnOptions || !returnOptions.length) return;
  const pool = returnOptions.filter((r) =>
    r.price != null &&
    !(maxStops === 0 && r.stops > 0) &&
    !(r.stops > 0 && r.layovers_min.some((l) => l > 180)));
  if (!pool.length) return;
  const airlines = new Set(f.airlines || []);
  const sameAirline = pool.filter((r) => (r.airlines || []).some((a) => airlines.has(a)));
  const pick = (sameAirline.length ? sameAirline : pool)
    .slice().sort((a, b) => a.price - b.price)[0];
  f.return_legs = pick.legs;
  f.return_airlines = pick.airlines;
  f.return_stops = pick.stops;
  f.return_duration_min = pick.total_duration_min;
  f.return_layovers_min = pick.layovers_min;
}

/**
 * Fetch the return direction once per (route, return date, stops) and attach
 * it to every flight that is going to be displayed. Runs after the price sweep
 * so the sweep itself only costs one fetch per lookup.
 */
async function attachReturnsToDisplay(flights, currency, onProgress, limit) {
  const groups = new Map();
  for (const f of flights) {
    if (!f || f.open_jaw || !f.return_date || (f.return_legs && f.return_legs.length)) continue;
    const key = [f.dest_airport, f.origin_airport, f.return_date, f.max_stops == null ? 2 : f.max_stops].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  let keys = Array.from(groups.keys());
  const capped = keys.length > limit;
  if (capped) keys = keys.slice(0, limit);
  const queue = keys.slice();
  let done = 0;
  async function worker() {
    while (queue.length) {
      const key = queue.shift();
      const [dest, origin, ret, ms] = key.split("|");
      const maxStops = Number(ms);
      try {
        const opts = await fetchOneWayOptions(dest, origin, ret, maxStops, currency);
        for (const f of groups.get(key)) attachReturnLeg(f, opts, maxStops);
      } catch (e) { /* best effort */ }
      done++;
      if (onProgress) onProgress({ phase: "returns", done, total: keys.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(_concurrency(), keys.length) }, worker));
  return { requested: keys.length, capped };
}

async function searchOneRoute(task, currency, opts) {
  const withReturn = !opts || opts.withReturn !== false;
  const maxStops = task.maxStops != null ? task.maxStops : 2;
  const legs = [{
    date: task.outbound, from: task.origin, to: task.dest, maxStops, maxLayover: 180,
  }];
  let trip = "one-way";
  let returnPromise = null;
  if (task.ret) {
    legs.push({ date: task.ret, from: task.dest, to: task.origin, maxStops, maxLayover: 180 });
    trip = "round-trip";
    // Google's round-trip response lists only the OUTBOUND itinerary (the price
    // is the round-trip total), so the return direction must be fetched
    // separately to show the return flight's airport, date, times and airline.
    // During the price sweep this is deferred (`withReturn: false`) so each
    // lookup costs a single fetch; returns are fetched once, afterwards, only
    // for the flights that are actually displayed.
    if (withReturn) {
      returnPromise = fetchOneWayOptions(task.dest, task.origin, task.ret, maxStops, currency);
    }
  }
  const tfs = buildTfs({ legs, trip, currency });
  const [html, returnOptions] = await Promise.all([
    _withRetry(() => fetchGoogleFlightsHtml(tfs, currency)),
    returnPromise || Promise.resolve(null),
  ]);
  const { options, airlineNames } = parseFlightsFromHtml(html);

  const out = [];
  for (const opt of options) {
    const d = toFlightDict(opt, {
      origin: task.origin, dest: task.dest, returnAirport: task.origin,
      outbound: task.outbound, ret: task.ret, stay: task.stay, openJaw: false,
      maxStops,
    }, airlineNames);
    if (maxStops === 0 && d.stops > 0) continue;
    if (d.stops > 0 && d.layovers_min.some((l) => l > 180)) continue;
    if (returnOptions) attachReturnLeg(d, returnOptions, maxStops);
    out.push(d);
  }
  return out;
}

/** Open-jaw: cheapest outbound one-way + cheapest return one-way, summed. */
async function searchOpenJaw(task, currency) {
  const maxStops = task.maxStops != null ? task.maxStops : 1;
  const outTfs = buildTfs({
    legs: [{ date: task.outbound, from: task.o_out, to: task.dest, maxStops, maxLayover: 180 }],
    trip: "one-way", currency,
  });
  const retTfs = buildTfs({
    legs: [{ date: task.ret, from: task.dest, to: task.o_ret, maxStops, maxLayover: 180 }],
    trip: "one-way", currency,
  });
  const [outHtml, retHtml] = await _withRetry(() =>
    Promise.all([fetchGoogleFlightsHtml(outTfs, currency), fetchGoogleFlightsHtml(retTfs, currency)])
  );
  const outP = parseFlightsFromHtml(outHtml);
  const retP = parseFlightsFromHtml(retHtml);

  const usable = (d) => !(maxStops === 0 && d.stops > 0) &&
    !(d.stops > 0 && d.layovers_min.some((l) => l > 180)) && d.price != null;

  const bestOut = outP.options
    .map((o) => toFlightDict(o, {
      origin: task.o_out, dest: task.dest, returnAirport: task.o_out,
      outbound: task.outbound, ret: task.ret, stay: task.stay, openJaw: true,
    }, outP.airlineNames))
    .filter(usable)
    .sort((a, b) => a.price - b.price)[0];
  const bestRet = retP.options
    .map((o) => toFlightDict(o, {
      origin: task.dest, dest: task.o_ret, returnAirport: task.dest,
      outbound: task.ret, ret: null, stay: null, openJaw: true,
    }, retP.airlineNames))
    .filter(usable)
    .sort((a, b) => a.price - b.price)[0];

  if (!bestOut || !bestRet) return [];

  return [{
    price: bestOut.price + bestRet.price,
    airlines: Array.from(new Set([...(bestOut.airlines || []), ...(bestRet.airlines || [])])),
    stops: bestOut.stops,
    return_stops: bestRet.stops,
    legs: bestOut.legs,
    return_legs: bestRet.legs,
    layovers_min: bestOut.layovers_min,
    return_layovers_min: bestRet.layovers_min,
    total_duration_min: bestOut.total_duration_min,
    origin_airport: task.o_out,
    return_airport: task.o_ret,
    dest_airport: task.dest,
    outbound_date: task.outbound,
    return_date: task.ret,
    stay_days: task.stay,
    return_airlines: bestRet.airlines,
    return_duration_min: bestRet.total_duration_min,
    open_jaw: true,
  }];
}

/**
 * Run the whole search. `params` mirrors the old backend payload.
 * `onProgress` is called after every completed lookup so the UI can stream.
 */
async function runSearch(params, onProgress) {
  _oneWayCache.clear(); // always quote fresh prices for a new search
  const origins = resolveLocations(params.origin);
  const dests = resolveLocations(params.destination);
  if (!origins.length) {
    throw new Error(`Could not resolve origin: "${params.origin}". Try an IATA code, a city, or a country (e.g. Germany).`);
  }
  if (!dests.length) {
    throw new Error(`Could not resolve destination: "${params.destination}". Try an IATA code, a city, or a country (e.g. Greece).`);
  }

  const isCountryOrigin = !!COUNTRY_AIRPORTS[params.origin.trim().toLowerCase()];
  const isCountryDest = !!COUNTRY_AIRPORTS[params.destination.trim().toLowerCase()];
  // An explicit list ("DUS, FRA, HAM") is honoured in full; a country expands
  // to a capped set so an "all airports × all airports" search stays sane.
  const originExplicit = isExplicitList(params.origin);
  const destExplicit = isExplicitList(params.destination);
  const orgs = origins.slice(0, originExplicit ? 20 : (isCountryOrigin ? 30 : 6));
  const dsts = dests.slice(0, destExplicit ? 20 : (isCountryDest ? 8 : 4));

  // ---- date window (max 31 calendar days) ----
  const dFrom = parseISODate(params.date_from) || addDays(new Date(), 30);
  const dTo = parseISODate(params.date_to) || dFrom;
  let start = dFrom, end = dTo;
  if (end < start) { const t = start; start = end; end = t; }

  const calendarDays = Math.round((end - start) / MS_DAY) + 1;
  if (calendarDays > 31) {
    throw new Error(
      `Date window is ${calendarDays} calendar days. Maximum is 31 (about one month); ` +
      `it may span two months (e.g. 15 Nov → 15 Dec) as long as the total is ≤ 31 days.`
    );
  }

  const windowDays = calendarDays; // inclusive number of days in the window

  const minDays = Math.max(1, Math.min(30, params.min_days || 7));
  const maxDays = Math.max(minDays, Math.min(30, params.max_days || minDays));
  const stayLengths = [];
  for (let s = minDays; s <= maxDays; s++) stayLengths.push(s);

  const currency = params.currency || "USD";
  const lookupCeiling = currentMaxSearches();

  // ---- plan the sweep ----
  // One "route" = an origin→destination airport pair × a stay length. The full
  // grid (routes × every calendar day) is far too many lookups for anything but
  // a single route, so the sweep runs in two passes:
  //   1. a broad pass over every route on a few spread-out days, then
  //   2. a deep pass that sweeps EVERY remaining day for the routes that looked
  //      cheapest in pass 1.
  // Pass 2 is what catches a cheap date that an evenly spaced sample steps over
  // (e.g. a Sun→Sun week that a "1st / 8th / 15th" sample would miss).
  // Each sweep lookup is outbound-only (one fetch); return flights are fetched
  // afterwards, once, and only for the flights that get displayed.
  const pairs = [];
  for (const o of orgs) for (const d of dsts) if (o !== d) pairs.push([o, d]);
  if (!pairs.length) pairs.push([orgs[0], dsts[0]]); // same airport in and out

  const thorough = params.date_mode === "every";
  const maxStopsForSearch = params.direct_only ? 0 : 2;

  const allDates = [];
  for (let i = 0; i < windowDays; i++) allDates.push(isoLocal(addDays(start, i)));

  let nPairs = pairs.length;
  const nStays = stayLengths.length;
  if (nPairs * nStays > lookupCeiling) {
    nPairs = Math.max(1, Math.floor(lookupCeiling / nStays));
  }
  const routePairs = pairs.slice(0, nPairs);
  const routeCount = Math.max(1, routePairs.length * nStays);

  // How many days the broad pass covers. "Every day in window" spends only part
  // of the budget here so the deep pass can sweep whole calendars; "Sampled
  // days" stops after the broad pass.
  const fullGrid = routeCount * windowDays;
  let broadCount;
  if (fullGrid <= lookupCeiling) {
    broadCount = windowDays; // everything fits — one pass, every day
  } else if (thorough) {
    broadCount = Math.max(1, Math.min(windowDays, Math.floor((lookupCeiling * 0.4) / routeCount)));
  } else {
    broadCount = Math.max(1, Math.min(windowDays, Math.min(8, Math.floor((lookupCeiling * 0.5) / routeCount) || 1)));
  }
  const broadDates = spreadDates(start, end, broadCount);

  const searchedOrigins = new Set();
  const sweptKeys = new Set(); // "origin|dest|stay|date" — every lookup we actually ran
  const routeKey = (o, d, s) => `${o}|${d}|${s}`;
  const sweepKey = (o, d, s, date) => `${o}|${d}|${s}|${date}`;
  const rtTask = (origin, dest, outbound, stay) => {
    searchedOrigins.add(origin);
    sweptKeys.add(sweepKey(origin, dest, stay, outbound));
    return {
      kind: "rt", origin, dest, outbound,
      ret: isoLocal(addDays(parseISODate(outbound), stay)), stay,
      maxStops: maxStopsForSearch,
    };
  };

  // ---- pass 1: broad grid, every route on the broad dates ----
  const broadTasks = [];
  for (const pair of routePairs) {
    for (const outbound of broadDates) {
      for (const stay of stayLengths) broadTasks.push(rtTask(pair[0], pair[1], outbound, stay));
    }
  }

  // ---- optional open-jaw tasks (different return airport) ----
  // Kept outside the sweep grid so a big sweep never swallows them.
  const ojTasks = [];
  if (params.open_jaw && orgs.length > 1) {
    const top = orgs.slice(0, 5);
    const ob = allDates[0];
    const stay = stayLengths[0];
    const ret = isoLocal(addDays(parseISODate(ob), stay));
    let added = 0;
    outer2:
    for (const oOut of top) {
      for (const oRet of top) {
        if (oOut === oRet) continue;
        for (const d of dsts.slice(0, 2)) {
          if (oOut === d || oRet === d) continue;
          ojTasks.push({ kind: "oj", o_out: oOut, o_ret: oRet, dest: d, outbound: ob, ret, stay,
            maxStops: params.direct_only ? 0 : 1 });
          searchedOrigins.add(oOut);
          if (++added >= 6) break outer2;
        }
      }
    }
  }

  const planned = { sweep: broadTasks.length + ojTasks.length, deep: 0, returns: 0 };

  // ---- execute with a small worker pool ----
  const all = [];
  const perOrigin = {};
  for (const o of orgs) perOrigin[o] = { direct: null, connecting: null, any: null };

  const startedAt = Date.now();
  const returnLimit = (() => {
    const n = Number(window.RETURN_FETCH_LIMIT);
    return Number.isFinite(n) && n > 0 ? Math.min(80, n) : 16;
  })();
  // Every lookup and every return fetch is one reader request, and the reader
  // allows ~_readerRate() of them a minute, so the wall-clock cost is the
  // request count divided by that rate. Keep a generous ceiling on top.
  const requestedTotal = () =>
    (planned.sweep + planned.deep) + Math.min(returnLimit, planned.returns || returnLimit);
  const timeBudgetMs = () =>
    Math.max(
      window.SEARCH_TIME_BUDGET_MS || 900000,
      Math.ceil(requestedTotal() / _readerRate()) * 60000 + 120000
    );
  const estimateMinutes = () => Math.max(1, Math.ceil(requestedTotal() / _readerRate()));
  let done = 0;
  let errors = 0;
  let lastError = null;
  let stopped = false;
  let currentPhase = "routes";

  function emitProgress() {
    if (!onProgress) return;
    onProgress({
      phase: currentPhase,
      done,
      total: planned.sweep + planned.deep,
      found: all.length,
      errors,
      throttleMs: _readerThrottledMs(),
      elapsedMs: Date.now() - startedAt,
      etaMinutes: estimateMinutes(),
    });
  }

  function record(f) {
    all.push(f);
    const bucket = perOrigin[f.origin_airport];
    if (bucket) {
      const isDirect = !f.open_jaw && f.stops === 0;
      const upd = (cur) => (cur == null || (f.price != null && (cur.price == null || f.price < cur.price)) ? f : cur);
      bucket.any = upd(bucket.any);
      if (isDirect) bucket.direct = upd(bucket.direct);
      if (f.stops > 0 || f.open_jaw) bucket.connecting = upd(bucket.connecting);
    }
  }

  async function runPass(taskList, label) {
    const queue = taskList.slice();
    let passDone = 0;
    currentPhase = label;
    async function worker() {
      while (queue.length) {
        if (stopped || Date.now() - startedAt > timeBudgetMs()) { stopped = true; return; }
        const task = queue.shift();
        try {
          const found = task.kind === "oj"
            ? await searchOpenJaw(task, currency)
            : await searchOneRoute(task, currency, { withReturn: false });
          for (const f of found) record(f);
        } catch (e) {
          errors++;
          lastError = e;
        } finally {
          done++;
          passDone++;
          emitProgress();
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(_concurrency(), taskList.length) }, worker));
    return passDone;
  }

  // Keep the progress line (and the "waiting for reader quota" hint) ticking
  // even while every worker is parked on the rate limiter.
  const heartbeat = typeof setInterval === "function" ? setInterval(emitProgress, 2000) : null;
  const stopHeartbeat = () => { if (heartbeat) clearInterval(heartbeat); };

  await runPass(broadTasks.concat(ojTasks), "routes");

  if (done > 0 && all.length === 0 && errors === done && lastError) {
    stopHeartbeat();
    throw lastError; // every single lookup failed — surface the real reason
  }

  // ---- pass 2: deep sweep of the remaining days for the cheapest routes ----
  let deepPairList = [];
  if (thorough && !stopped && fullGrid > lookupCeiling) {
    // Cheapest price seen per route (pair + stay) in pass 1.
    const routePrice = new Map();
    for (const f of all) {
      if (f.open_jaw || f.price == null) continue;
      const k = routeKey(f.origin_airport, f.dest_airport, f.stay_days);
      if (!routePrice.has(k) || f.price < routePrice.get(k)) routePrice.set(k, f.price);
    }
    // Rank airport PAIRS by their best price, so every stay length of the most
    // promising route gets its calendar swept (not just one stay).
    const pairPrice = new Map();
    for (const [k, price] of routePrice) {
      const pk = k.split("|").slice(0, 2).join("|");
      if (!pairPrice.has(pk) || price < pairPrice.get(pk)) pairPrice.set(pk, price);
    }
    const rankedPairs = routePairs.slice().sort((a, b) => {
      const pa = pairPrice.has(a.join("|")) ? pairPrice.get(a.join("|")) : Infinity;
      const pb = pairPrice.has(b.join("|")) ? pairPrice.get(b.join("|")) : Infinity;
      return pa - pb;
    });

    // Fill in the days the broad pass skipped, cheapest route first, until the
    // lookup ceiling is reached. A route whose whole remaining calendar fits
    // gets it; otherwise it gets ~80% of what is left and the next route gets
    // a share too, so one badly-ranked route can't swallow the budget.
    // Missing days are visited in bisection order (the middle of the window
    // first, then the middles of the halves, …) so that partial coverage is
    // spread evenly instead of leaving a whole month-end unchecked.
    const missing = bisectionOrder(allDates.filter((d) => !broadDates.includes(d)));
    const deepTasks = [];
    const deepPairs = new Map();
    let room = lookupCeiling - broadTasks.length - ojTasks.length;
    for (const pair of rankedPairs) {
      if (room <= 0) break;
      const deficit = missing.length * stayLengths.length;
      const reserve = rankedPairs.length > 1 ? Math.ceil(room * 0.2) : 0;
      let share = room - reserve >= deficit ? deficit : Math.max(stayLengths.length, Math.ceil((room - reserve) * 0.8));
      share = Math.min(share, room);
      const pk = pair.join("|");
      let spent = 0;
      const days = new Set();
      for (const outbound of missing) {
        if (share < stayLengths.length) break; // only ever take whole days
        for (const stay of stayLengths) {
          if (room <= 0) break;
          deepTasks.push(rtTask(pair[0], pair[1], outbound, stay));
          share--;
          room--;
          spent++;
          days.add(outbound);
        }
      }
      if (spent) deepPairs.set(pk, { lookups: spent, dates: days.size + broadDates.length });
    }
    deepPairList = Array.from(deepPairs.entries())
      .map(([k, v]) => `${k.split("|").join("→")} (${v.dates} days)`);
    if (deepTasks.length) {
      planned.deep = deepTasks.length;
      await runPass(deepTasks, "every day");
    }
  }

  all.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  const directs = all.filter((r) => !r.open_jaw && r.stops === 0);
  const connecting = all.filter((r) => r.stops > 0 || r.open_jaw);

  // cheapest option found for each outbound date we actually queried
  const perDate = {};
  for (const f of all) {
    const k = f.outbound_date;
    if (!k) continue;
    if (!perDate[k] || (f.price != null && (perDate[k].price == null || f.price < perDate[k].price))) {
      perDate[k] = f;
    }
  }
  const perDateList = Object.keys(perDate).sort()
    .map((d) => ({ date: d, cheapest: perDate[d] }));

  const perOriginList = orgs.map((o) => ({
    airport: airportInfo(o),
    cheapest_any: perOrigin[o].any,
    cheapest_direct: perOrigin[o].direct,
    cheapest_connecting: perOrigin[o].connecting,
    has_flights: perOrigin[o].any != null,
    searched: searchedOrigins.has(o),
  })).sort((x, y) => {
    const px = x.cheapest_any && x.cheapest_any.price != null ? x.cheapest_any.price : 1e9;
    const py = y.cheapest_any && y.cheapest_any.price != null ? y.cheapest_any.price : 1e9;
    return (x.has_flights ? 0 : 1) - (y.has_flights ? 0 : 1) || px - py;
  });

  // ---- returns: one fetch per (route, return date), only for what we display ----
  // Return lookups share the reader quota with the date sweep, so the list is
  // ordered by importance and cut off at window.RETURN_FETCH_LIMIT.
  const displaySet = [];
  const seenFlights = new Set();
  const addDisplay = (f) => { if (f && !seenFlights.has(f)) { seenFlights.add(f); displaySet.push(f); } };
  addDisplay(directs[0]);
  addDisplay(connecting[0]);
  all.slice(0, 12).forEach(addDisplay);        // the ranked list people actually read
  perOriginList.forEach((r) => addDisplay(r.cheapest_any));
  perDateList.forEach((r) => addDisplay(r.cheapest));
  all.slice(12, 50).forEach(addDisplay);
  const returnPlan = await attachReturnsToDisplay(displaySet, currency, (p) => {
    currentPhase = "returns";
    if (onProgress) onProgress({ phase: "returns", done: p.done, total: p.total, found: all.length, errors });
  }, returnLimit);
  planned.returns = returnPlan.requested;
  stopHeartbeat();

  // Which dates were fully swept (every route) vs only partially?
  const datesChecked = Array.from(new Set(all.map((f) => f.outbound_date).filter(Boolean))).sort();
  const allRouteList = [];
  for (const pair of routePairs) for (const stay of stayLengths) allRouteList.push([pair[0], pair[1], stay]);
  let fullySweptRoutes = 0;
  for (const [o, d, s] of allRouteList) {
    const covered = allDates.every((dt) => sweptKeys.has(sweepKey(o, d, s, dt)));
    if (covered) fullySweptRoutes++;
  }

  return {
    origin_input: params.origin,
    destination_input: params.destination,
    origins_searched: orgs.map(airportInfo),
    destinations_searched: dsts.map(airportInfo),
    date_from: isoLocal(start),
    date_to: isoLocal(end),
    min_days: minDays,
    max_days: maxDays,
    sample_outbounds: datesChecked,
    currency,
    direct_only: !!params.direct_only,
    searches_performed: done,
    lookup_errors: errors,
    stopped_early: stopped || done < planned.sweep + planned.deep,
    // Exactly what this search covered — so partial coverage is never silent.
    pairs_available: pairs.length,
    pairs_searched: routePairs.length,
    dates_checked: datesChecked.length,
    dates_in_window: windowDays,
    stays_checked: stayLengths.length,
    stays_requested: stayLengths.length,
    routes_available: pairs.length * stayLengths.length,
    routes_fully_swept: fullySweptRoutes,
    routes_deep: deepPairList.length,
    deep_pairs: deepPairList,
    return_fetches: planned.returns,
    returns_truncated: !!returnPlan.capped,
    reader_rate_per_minute: _readerRate(),
    cheapest_direct: directs[0] || null,
    cheapest_with_stops: connecting[0] || null,
    ranked_options: all.slice(0, 50),
    per_date_summary: perDateList,
    per_origin_summary: perOriginList,
    all_results_count: all.length,
    note:
      "Live Google Flights prices, fetched and parsed entirely in your browser — no backend, no API key. " +
      "All of Google's itinerary lists (nonstop and connecting) are parsed, so the cheapest option is included. " +
      "Country inputs expand to that country's commercial airports, and every resolved airport pair is searched; " +
      "you can also list airports directly (e.g. \"DUS, FRA, HAM\"). The date window is capped at 31 days. " +
      "\"Every day in window\" spreads the lookup budget over the whole window in two passes: a first pass checks " +
      "every route on a few spread-out days, then a second pass fills in more days for the routes that looked " +
      "cheapest, visiting the missing days in bisection order so no stretch of the calendar is left unchecked. " +
      "\"Sampled days\" stops after the first pass (faster). The header always states exactly how many pairs, days " +
      "and stay lengths were covered, so partial coverage is never silent. The key-less reader serves about " +
      `${_readerRate()} lookups a minute per visitor; lookups are queued under that rate (the progress line shows ` +
      "any wait), so a large sweep takes a few minutes. A free reader API key in ⚙️ settings removes the wait. " +
      "Round-trip prices are Google's own totals; Google's round-trip page lists only the outbound itinerary, " +
      "so the return flight shown is the cheapest return on that date (same airline when available), fetched " +
      `separately for the flights on display (up to ${returnLimit}). ` +
      (params.direct_only ? "Only nonstop itineraries were requested. " : "") +
      "Open-jaw totals are estimated from two separate one-ways.",
  };
}

/* ------------------------------------------------------------------ *
 *  Rendering
 * ------------------------------------------------------------------ */
function renderFlight(f, badgeClass, badgeText) {
  if (!f) return "";
  const out = _dirSummary(f.legs, f.airlines, f.stops);
  const ret = f.return_legs ? _dirSummary(f.return_legs, f.return_airlines, f.return_stops) : null;
  const oj = f.open_jaw ? " · Open-jaw" : "";
  let html = `
    <div class="flight-card ${badgeClass}">
      <span class="badge ${badgeClass === "best-direct" ? "green" : "blue"}">${badgeText}</span>
      <div class="price">${f.price != null ? f.price + " " + (window._currency || "USD") : "N/A"}</div>`;

  // Outbound: departure airport · date · departure & arrival time · airline · stay days
  if (out) {
    html += `
      <div class="dir">
        <span class="dir-label">Outbound</span>
        <span class="dir-main"><strong>${out.route}</strong> · ${out.date} · ${out.times} · ${out.airlines} · ${out.stops}${f.stay_days != null ? ` · ${f.stay_days} days stay` : ""}</span>
      </div>`;
    html += _legsDetail(f.legs, f.layovers_min);
  }
  // Return: exactly the same sequence for the return flight
  if (ret) {
    html += `
      <div class="dir">
        <span class="dir-label ret">Return</span>
        <span class="dir-main"><strong>${ret.route}</strong> · ${ret.date} · ${ret.times} · ${ret.airlines} · ${ret.stops}</span>
      </div>`;
    html += _legsDetail(f.return_legs, f.return_layovers_min);
  } else if (f.return_date) {
    html += `
      <div class="dir">
        <span class="dir-label ret">Return</span>
        <span class="dir-main dir-unavailable"><strong>${f.dest_airport || ""} → ${f.return_airport || f.origin_airport}</strong> · ${fmtDate(f.return_date)} · times/airline unavailable</span>
      </div>`;
  }
  html += `
      <div class="meta">Flight time: outbound ${formatDuration(f.total_duration_min)}` +
    (f.return_duration_min != null ? ` · return ${formatDuration(f.return_duration_min)}` : "") +
    `${oj}</div>
    </div>`;
  return html;
}

/** One-line summary of one direction: airports · date · times · airlines · stops. */
function _dirSummary(legs, airlines, stops) {
  if (!legs || !legs.length) return null;
  const first = legs[0], last = legs[legs.length - 1];
  const [depDate, depTime] = String(first.departure || "").split(" ");
  const [arrDate, arrTime] = String(last.arrival || "").split(" ");
  const arr = (arrDate && arrDate !== depDate) ? `${arrDate} ${arrTime}` : (arrTime || "—");
  const n = stops != null ? stops : Math.max(0, legs.length - 1);
  return {
    route: `${first.from} → ${last.to}`,
    date: depDate || "—",
    times: `${depTime || "—"} – ${arr || "—"}`,
    airlines: (airlines || []).join(", ") || "—",
    stops: n === 0 ? "Direct" : (n === 1 ? "1 stop" : n + " stops"),
  };
}

/** Per-leg detail rows, only needed when the direction has connections. */
function _legsDetail(legs, layovers) {
  if (!legs || legs.length < 2) return "";
  let html = "";
  legs.forEach((leg, i) => {
    if (i > 0 && layovers && layovers[i - 1] != null) {
      html += `<div class="layover">Layover: ${formatDuration(layovers[i - 1])}</div>`;
    }
    html += `
      <div class="leg">
        <strong>${leg.from} → ${leg.to}</strong>
        <span>${leg.departure} → ${leg.arrival}</span>
        <span>${formatDuration(leg.duration_min)}</span>
        ${leg.plane ? `<span style="color:var(--muted)">${leg.plane}</span>` : ""}
      </div>`;
  });
  return html;
}

/** Table cell for a direction: airport · date · times · airline · stops. */
function _dirCell(legs, airlines, stops) {
  const s = _dirSummary(legs, airlines, stops);
  if (!s) return `<span class="dir-unavailable">—</span>`;
  return `<strong>${s.route}</strong><br>` +
    `<span class="dir-unavailable">${s.date} · ${s.times} · ${s.airlines} · ${s.stops}</span>`;
}

/** Table cell for the return direction (with a fallback when details are missing). */
function _returnCell(f) {
  if (f.return_legs) return _dirCell(f.return_legs, f.return_airlines, f.return_stops);
  if (f.return_date) {
    return `<strong>${f.dest_airport || ""} → ${f.return_airport || f.origin_airport}</strong><br>` +
      `<span class="dir-unavailable">${fmtDate(f.return_date)} · times/airline unavailable</span>`;
  }
  return `<span class="dir-unavailable">—</span>`;
}

function renderResults(data) {
  const originList = (data.origins_searched || []).map((a) => a.code).join(", ");
  const destList = (data.destinations_searched || []).map((a) => a.code).join(", ");
  $("resultMeta").innerHTML = `
    <span><strong>${data.origin_input}</strong> → <strong>${data.destination_input}</strong></span>
    <span>Airports: ${originList || "—"} → ${destList || "—"}</span>
    <span>Window <strong>${fmtDate(data.date_from)}</strong> – <strong>${fmtDate(data.date_to)}</strong> · Stay <strong>${data.min_days}–${data.max_days}</strong> days</span>
    ${data.direct_only ? `<span>Direct (nonstop) only</span>` : ""}
    <span>${data.searches_performed || 0} lookups · ${data.all_results_count || 0} options found${data.stopped_early ? " · partial (time limit)" : ""}</span>
    ${data.pairs_available ? `<span>Coverage: <strong>${data.pairs_searched}/${data.pairs_available}</strong> airport pairs · <strong>${data.dates_checked}/${data.dates_in_window}</strong> dates · <strong>${data.stays_checked}/${data.stays_requested}</strong> stay lengths</span>` : ""}
    <span>Return details loaded for <strong>${data.return_fetches || 0}</strong> flight${(data.return_fetches || 0) === 1 ? "" : "s"}; each one is a separate reader lookup, so rows beyond that show the return date only${data.returns_truncated ? " (raise the ceiling in ⚙️ to load more)" : ""}</span>
    ${data.routes_fully_swept
      ? `<span>Every day of the window swept for <strong>${data.routes_fully_swept}</strong> of <strong>${data.routes_available}</strong> routes</span>`
      : (data.deep_pairs && data.deep_pairs.length
        ? `<span>Deeper calendar sweep for the cheapest routes: <strong>${data.deep_pairs.slice(0, 6).join(" · ")}</strong></span>`
        : "")}
  `;

  const cur = data.currency || window._currency || "";
  let html = "";
  if (data.cheapest_direct) html += renderFlight(data.cheapest_direct, "best-direct", "Cheapest direct");
  if (data.cheapest_with_stops) html += renderFlight(data.cheapest_with_stops, "best-stops", "Cheapest ≤2 stops / open-jaw");

  const ranked = data.ranked_options || [];
  if (ranked.length) {
    const shown = ranked.length;
    const total = data.all_results_count || shown;
    html += `<div class="section-title">All cheapest options, sorted by price${total > shown ? ` (showing top ${shown} of ${total})` : ` (${shown} found)`}</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>#</th><th>Price</th><th>Outbound flight</th><th>Return flight</th><th>Stay</th><th>Type</th>
    </tr></thead><tbody>`;
    ranked.forEach((f, i) => {
      const type = f.open_jaw ? "Open-jaw" : "Round-trip";
      html += `<tr>
        <td class="rank-cell">${i + 1}</td>
        <td class="price-cell">${f.price != null ? f.price + " " + cur : "—"}</td>
        <td>${_dirCell(f.legs, f.airlines, f.stops)}</td>
        <td>${_returnCell(f)}</td>
        <td>${f.stay_days != null ? f.stay_days + "d" : "—"}</td>
        <td>${type}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  } else {
    html += `<div class="flight-card"><div class="empty">No flights found in the sampled dates/airports. Try a different route, wider window, or fewer constraints.</div></div>`;
  }

  const dateRows = data.per_date_summary || [];
  if (dateRows.length > 1) {
    html += `<div class="section-title">Cheapest by departure date (sampled across your window)</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>Outbound flight</th><th>Cheapest</th><th>Return flight</th>
    </tr></thead><tbody>`;
    dateRows.forEach((row) => {
      const f = row.cheapest;
      html += `<tr>
        <td>${_dirCell(f.legs, f.airlines, f.stops)}</td>
        <td class="price-cell">${f.price != null ? f.price + " " + cur : "—"}</td>
        <td>${_returnCell(f)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  if (data.per_origin_summary && data.per_origin_summary.length) {
    html += `<div class="section-title">Per departure airport (best found)</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>Airport</th><th>City</th><th>Best price</th>
      <th>Outbound flight</th><th>Return flight</th><th>Stay</th><th>Status</th>
    </tr></thead><tbody>`;
    data.per_origin_summary.forEach((row) => {
      const a = row.airport || {};
      const best = row.cheapest_any;
      if (best) {
        html += `<tr>
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td class="price-cell">${best.price != null ? best.price + " " + cur : "—"}</td>
          <td>${_dirCell(best.legs, best.airlines, best.stops)}</td>
          <td>${_returnCell(best)}</td>
          <td>${best.stay_days != null ? best.stay_days + "d" : "—"}</td>
          <td>Verified</td>
        </tr>`;
      } else if (row.searched) {
        html += `<tr>
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td colspan="4">—</td>
          <td>No flights</td>
        </tr>`;
      } else {
        html += `<tr style="opacity:0.55">
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td colspan="4">—</td>
          <td>Not checked</td>
        </tr>`;
      }
    });
    html += `</tbody></table></div>`;
  }

  $("flightResults").innerHTML = html;
  $("resultNote").textContent = data.note || "";
}

/* ------------------------------------------------------------------ *
 *  Event wiring
 * ------------------------------------------------------------------ */
function bindResolveHint(inputId, hintId) {
  const input = $(inputId), hint = $(hintId);
  const update = () => {
    const codes = resolveLocations(input.value);
    if (!input.value.trim()) { hint.textContent = ""; return; }
    if (!codes.length) {
      hint.innerHTML = `<span class="err">No match — try an IATA code, city, or country.</span>`;
      return;
    }
    const parts = codes.slice(0, 5).map((c) => {
      const a = airportInfo(c);
      return `${c}${a.city ? " (" + a.city.replace(/\b\w/g, (m) => m.toUpperCase()) + ")" : ""}`;
    });
    const more = codes.length > 5 ? ` +${codes.length - 5} more` : "";
    hint.innerHTML = `<span class="ok">→ ${parts.join(", ")}${more}</span>`;
  };
  input.addEventListener("input", update);
  input.addEventListener("change", update);
}

const SETTINGS_KEY = "flightsfinder-settings";

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (e) {}
  $("readerUrl").value = s.readerUrl || window.FLIGHT_READER || "https://r.jina.ai/";
  $("readerKey").value = s.readerKey || window.FLIGHT_READER_KEY || "";
  $("maxSearches").value = s.maxSearches || window.MAX_SEARCHES || 200;
  const hosts = s.googleHosts || (window.FLIGHT_GOOGLE_HOSTS || []);
  $("googleHosts").value = Array.isArray(hosts) ? hosts.join(", ") : String(hosts || "");
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      readerUrl: $("readerUrl").value.trim(),
      readerKey: $("readerKey").value.trim(),
      maxSearches: parseInt($("maxSearches").value, 10) || window.MAX_SEARCHES || 200,
      googleHosts: $("googleHosts").value.trim(),
    }));
  } catch (e) {}
}

function wire() {
  loadSettings();

  const d1 = addDays(new Date(), 45);
  const d2 = addDays(d1, 30);
  $("date_from").value = isoLocal(d1);
  $("date_to").value = isoLocal(d2);

  bindResolveHint("origin", "originHint");
  bindResolveHint("destination", "destinationHint");

  for (const id of ["readerUrl", "readerKey", "maxSearches", "googleHosts"]) {
    $(id).addEventListener("change", saveSettings);
  }

  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("errorBox").style.display = "none";
    $("results").style.display = "none";
    $("progress").style.display = "block";
    $("progress").textContent = "Contacting the reader…";
    const btn = $("submitBtn");
    btn.disabled = true;
    $("btnText").style.display = "none";
    $("btnSpin").style.display = "inline-block";

    const params = {
      origin: $("origin").value.trim(),
      destination: $("destination").value.trim(),
      min_days: parseInt($("min_days").value, 10) || 6,
      max_days: parseInt($("max_days").value, 10) || 7,
      date_from: $("date_from").value || null,
      date_to: $("date_to").value || null,
      date_mode: $("date_mode") ? $("date_mode").value : "sampled",
      currency: $("currency").value,
      open_jaw: $("open_jaw").value === "true",
      direct_only: $("direct_only") ? $("direct_only").checked : false,
    };
    window._currency = params.currency;
    saveSettings();

    try {
      const data = await runSearch(params, (p) => {
        const label = p.phase === "returns" ? "Loading return flights"
          : p.phase === "every day" ? "Sweeping more dates"
          : "Searching airports";
        const secs = Math.round((p.elapsedMs || 0) / 1000);
        const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
        const waiting = p.throttleMs && p.throttleMs > 1000
          ? ` · waiting for the free reader's quota (${Math.ceil(p.throttleMs / 1000)}s) — a free reader key in ⚙️ removes this wait`
          : "";
        const eta = p.phase !== "returns" && p.total
          ? ` · up to ~${p.etaMinutes || 1} min on the free reader`
          : "";
        $("progress").textContent =
          `${label}… ${p.done}/${p.total} lookups [${clock}] · ${p.found} options found` +
          (p.errors ? ` · ${p.errors} failed` : "") + waiting + eta;
      });
      renderResults(data);
      $("results").style.display = "block";
    } catch (err) {
      $("errorBox").textContent = err.message || "Something went wrong";
      $("errorBox").style.display = "block";
    } finally {
      btn.disabled = false;
      $("btnText").style.display = "inline";
      $("btnSpin").style.display = "none";
      $("progress").style.display = "none";
    }
  });

  (async () => {
    try { await loadAirports(); } catch (e) {}
    const n = Object.keys(AIRPORTS).length;
    const pill = $("airportPill"), txt = $("airportPillText");
    pill.className = "pill " + (n ? "ok" : "bad");
    txt.textContent = `airports: ${n ? n + " loaded" : "unavailable"}`;
    $("dataPill").className = "pill ok";
    $("dataPillText").textContent = "data: live Google Flights";
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}
