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
function resolveLocations(text) {
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
    if (lower.includes(city) || city.includes(lower)) return [CITY_TO_IATA[city][0]];
  }
  for (const code in AIRPORTS) {
    const name = (AIRPORTS[code].name || "").toLowerCase();
    if (lower && name.includes(lower)) return [code];
  }
  return [];
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
  const val = Number.isFinite(typed) && typed > 0 ? typed : (window.MAX_SEARCHES || 12);
  return Math.max(1, Math.min(40, val));
}

function _concurrency() {
  return Math.max(1, Math.min(6, window.SEARCH_CONCURRENCY || 3));
}

/** Fetch the rendered Google Flights page (HTML) through the reader. */
async function fetchGoogleFlightsHtml(tfs, currency, timeoutMs = 70000) {
  const target = "https://www.google.com/travel/flights?tfs=" +
    encodeURIComponent(tfs) + "&hl=&curr=" + encodeURIComponent(currency);
  const url = currentReader() + target;

  const headers = { "x-respond-with": "html" };
  const key = currentReaderKey();
  if (key) headers["Authorization"] = "Bearer " + key;

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { headers, signal: ctrl && ctrl.signal, redirect: "follow", cache: "no-store" });
    if (!res.ok) {
      const err = new Error(
        res.status === 429
          ? "The public reader is rate-limiting right now (HTTP 429). Wait a moment and retry, or add a free reader API key in ⚙️ settings."
          : `Reader returned HTTP ${res.status}.`
      );
      err.status = res.status;
      throw err;
    }
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function _withRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      // Don't retry hard 4xx errors (except 429 rate-limit).
      if (e.status && e.status !== 429 && e.status < 500) throw e;
      await _sleep(800 * Math.pow(2, i) + Math.floor(Math.random() * 400));
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
  const list = payload && payload[3] && payload[3][0];
  if (!list) return { options, airlineNames, empty: true };

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
      if (legs.length) options.push({ price, airline_codes: airlineCodes, legs });
    } catch (e) { /* skip malformed option */ }
  }
  return { options, airlineNames, empty: options.length === 0 };
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
  return ds ? `${ds} ${_pad2(t[0])}:${_pad2(t[1])}` : "—";
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
function fmtDate(iso) { return (iso || "").slice(0, 10); }

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

/* ------------------------------------------------------------------ *
 *  Search orchestration
 * ------------------------------------------------------------------ */
async function searchOneRoute(task, currency) {
  const legs = [{
    date: task.outbound, from: task.origin, to: task.dest, maxStops: 2, maxLayover: 180,
  }];
  let trip = "one-way";
  if (task.ret) {
    legs.push({ date: task.ret, from: task.dest, to: task.origin, maxStops: 2, maxLayover: 180 });
    trip = "round-trip";
  }
  const tfs = buildTfs({ legs, trip, currency });
  const html = await _withRetry(() => fetchGoogleFlightsHtml(tfs, currency));
  const { options, airlineNames } = parseFlightsFromHtml(html);

  const out = [];
  for (const opt of options) {
    const d = toFlightDict(opt, {
      origin: task.origin, dest: task.dest, returnAirport: task.origin,
      outbound: task.outbound, ret: task.ret, stay: task.stay, openJaw: false,
    }, airlineNames);
    if (d.stops > 0 && d.layovers_min.some((l) => l > 180)) continue;
    out.push(d);
  }
  return out;
}

/** Open-jaw: cheapest outbound one-way + cheapest return one-way, summed. */
async function searchOpenJaw(task, currency) {
  const outTfs = buildTfs({
    legs: [{ date: task.outbound, from: task.o_out, to: task.dest, maxStops: 1, maxLayover: 180 }],
    trip: "one-way", currency,
  });
  const retTfs = buildTfs({
    legs: [{ date: task.ret, from: task.dest, to: task.o_ret, maxStops: 1, maxLayover: 180 }],
    trip: "one-way", currency,
  });
  const [outHtml, retHtml] = await _withRetry(() =>
    Promise.all([fetchGoogleFlightsHtml(outTfs, currency), fetchGoogleFlightsHtml(retTfs, currency)])
  );
  const outP = parseFlightsFromHtml(outHtml);
  const retP = parseFlightsFromHtml(retHtml);

  const bestOut = outP.options
    .map((o) => toFlightDict(o, {
      origin: task.o_out, dest: task.dest, returnAirport: task.o_out,
      outbound: task.outbound, ret: task.ret, stay: task.stay, openJaw: true,
    }, outP.airlineNames))
    .sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))[0];
  const bestRet = retP.options
    .map((o) => toFlightDict(o, {
      origin: task.dest, dest: task.o_ret, returnAirport: task.dest,
      outbound: task.ret, ret: null, stay: null, openJaw: true,
    }, retP.airlineNames))
    .sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))[0];

  if (!bestOut || !bestRet || bestOut.price == null || bestRet.price == null) return [];

  const airlines = Array.from(new Set([...(bestOut.airlines || []), ...(bestRet.airlines || [])]));
  return [{
    price: bestOut.price + bestRet.price,
    airlines,
    stops: (bestOut.stops || 0) + (bestRet.stops || 0),
    legs: [...(bestOut.legs || []), ...(bestRet.legs || [])],
    layovers_min: [...(bestOut.layovers_min || []), ...(bestRet.layovers_min || [])],
    total_duration_min: (bestOut.total_duration_min || 0) + (bestRet.total_duration_min || 0),
    origin_airport: task.o_out,
    return_airport: task.o_ret,
    dest_airport: task.dest,
    outbound_date: task.outbound,
    return_date: task.ret,
    stay_days: task.stay,
    open_jaw: true,
  }];
}

/**
 * Run the whole search. `params` mirrors the old backend payload.
 * `onProgress` is called after every completed lookup so the UI can stream.
 */
async function runSearch(params, onProgress) {
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
  const orgs = origins.slice(0, isCountryOrigin ? 30 : 6);
  const dsts = dests.slice(0, isCountryDest ? 15 : 4);

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

  const span = Math.round((end - start) / MS_DAY);
  const offsets = [0];
  if (span > 0) {
    const steps = Math.min(5, span);
    for (let i = 1; i <= steps; i++) offsets.push(Math.round((i * span) / steps));
  }
  const sampleOutbounds = Array.from(new Set(offsets)).sort((a, b) => a - b)
    .map((o) => isoLocal(addDays(start, o)));

  const minDays = Math.max(1, Math.min(30, params.min_days || 7));
  const maxDays = Math.max(minDays, Math.min(30, params.max_days || minDays));
  const stayLengths = [];
  for (let s = minDays; s <= maxDays; s++) stayLengths.push(s);

  const currency = params.currency || "USD";
  const maxSearches = currentMaxSearches();

  // ---- spend the (limited) lookup budget wisely ----
  // Country inputs expand to many airports, so we divide the budget between
  // "how many dates to sample" and "how many airport pairs to try" instead of
  // dumping the whole budget onto the first sampled date.
  const pairs = [];
  for (const o of orgs) for (const d of dsts) if (o !== d) pairs.push([o, d]);

  let nDates = Math.min(sampleOutbounds.length, 6);
  let nPairs = Math.min(pairs.length, (isCountryOrigin || isCountryDest) ? 6 : 3);
  let nStays = stayLengths.length;

  while (nDates * nPairs * nStays > maxSearches && nStays > 1) nStays--;
  while (nDates * nPairs * nStays > maxSearches) {
    if (nDates >= nPairs && nDates > 1) nDates--;
    else if (nPairs > 1) nPairs--;
    else break;
  }

  const datesUsed = spreadDates(start, end, nDates);
  const staysUsed = stayLengths.slice(0, Math.max(1, nStays));

  // ---- build the task list: airport pair → date → stay ----
  const tasks = [];
  outer:
  for (const pair of pairs.slice(0, nPairs)) {
    for (const outbound of datesUsed) {
      for (const stay of staysUsed) {
        tasks.push({
          kind: "rt", origin: pair[0], dest: pair[1], outbound,
          ret: isoLocal(addDays(parseISODate(outbound), stay)), stay,
        });
        if (tasks.length >= maxSearches) break outer;
      }
    }
  }

  // ---- optional open-jaw tasks (different return airport) ----
  if (params.open_jaw && orgs.length > 1 && tasks.length < maxSearches) {
    const top = orgs.slice(0, 5);
    const ob = datesUsed[0];
    const stay = staysUsed[0];
    const ret = isoLocal(addDays(parseISODate(ob), stay));
    outer2:
    for (const oOut of top) {
      for (const oRet of top) {
        if (oOut === oRet) continue;
        for (const d of dsts.slice(0, 2)) {
          if (oOut === d || oRet === d) continue;
          tasks.push({ kind: "oj", o_out: oOut, o_ret: oRet, dest: d, outbound: ob, ret, stay });
          if (tasks.length >= maxSearches + 3) break outer2;
        }
      }
    }
  }

  // ---- execute with a small worker pool ----
  const all = [];
  const perOrigin = {};
  for (const o of orgs) perOrigin[o] = { direct: null, connecting: null, any: null };

  const startedAt = Date.now();
  let done = 0;
  let errors = 0;
  let lastError = null;
  let stopped = false;

  const queue = tasks.slice();

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

  async function worker() {
    while (queue.length) {
      if (Date.now() - startedAt > (window.SEARCH_TIME_BUDGET_MS || 90000)) { stopped = true; return; }
      const task = queue.shift();
      try {
        const found = task.kind === "oj"
          ? await searchOpenJaw(task, currency)
          : await searchOneRoute(task, currency);
        for (const f of found) record(f);
      } catch (e) {
        errors++;
        lastError = e;
      } finally {
        done++;
        if (onProgress) onProgress({ done, total: tasks.length, found: all.length, errors });
      }
    }
  }

  const workers = [];
  const n = Math.min(_concurrency(), tasks.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);

  if (done > 0 && all.length === 0 && errors === done && lastError) {
    throw lastError; // every single lookup failed — surface the real reason
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
  })).sort((x, y) => {
    const px = x.cheapest_any && x.cheapest_any.price != null ? x.cheapest_any.price : 1e9;
    const py = y.cheapest_any && y.cheapest_any.price != null ? y.cheapest_any.price : 1e9;
    return (x.has_flights ? 0 : 1) - (y.has_flights ? 0 : 1) || px - py;
  });

  return {
    origin_input: params.origin,
    destination_input: params.destination,
    origins_searched: orgs.map(airportInfo),
    destinations_searched: dsts.map(airportInfo),
    date_from: isoLocal(start),
    date_to: isoLocal(end),
    min_days: minDays,
    max_days: maxDays,
    sample_outbounds: datesUsed,
    currency,
    searches_performed: done,
    lookup_errors: errors,
    stopped_early: stopped || done >= maxSearches,
    cheapest_direct: directs[0] || null,
    cheapest_with_stops: connecting[0] || null,
    ranked_options: all.slice(0, 15),
    per_date_summary: perDateList,
    per_origin_summary: perOriginList,
    all_results_count: all.length,
    note:
      "Live Google Flights prices, fetched and parsed entirely in your browser — no backend, no API key. " +
      "Country inputs expand to that country's commercial airports. The date window is capped at 31 days and " +
      "sampled (not every single day) — see the date breakdown — and the number of lookups is capped (⚙️ settings) " +
      "to respect the free reader, so the budget is split between dates and airports. " +
      "Round-trip prices are Google's own totals; the itinerary shown is the outbound (Google pairs the return automatically). " +
      "Open-jaw totals are estimated from two separate one-ways.",
  };
}

/* ------------------------------------------------------------------ *
 *  Rendering
 * ------------------------------------------------------------------ */
function renderFlight(f, badgeClass, badgeText) {
  if (!f) return "";
  let legsHtml = "";
  (f.legs || []).forEach((leg, i) => {
    if (i > 0 && f.layovers_min && f.layovers_min[i - 1] != null) {
      legsHtml += `<div class="layover">Layover: ${formatDuration(f.layovers_min[i - 1])}</div>`;
    }
    legsHtml += `
      <div class="leg">
        <strong>${leg.from} → ${leg.to}</strong>
        <span>${leg.departure} → ${leg.arrival}</span>
        <span>${formatDuration(leg.duration_min)}</span>
        ${leg.plane ? `<span style="color:var(--muted)">${leg.plane}</span>` : ""}
      </div>`;
  });
  const stopsLabel = f.stops === 0 ? "Direct" : (f.stops === 1 ? "1 stop" : (f.stops || 0) + " stops");
  const route = `${f.origin_airport || ""}` +
    (f.return_airport && f.return_airport !== f.origin_airport ? " ↩ " + f.return_airport : "") +
    ` → ${f.dest_airport || ""}`;
  const dates = f.outbound_date ? `${fmtDate(f.outbound_date)} → ${fmtDate(f.return_date)} (${f.stay_days || "?"}d)` : "";
  const oj = f.open_jaw ? " · Open-jaw" : "";
  return `
    <div class="flight-card ${badgeClass}">
      <span class="badge ${badgeClass === "best-direct" ? "green" : "blue"}">${badgeText}</span>
      <div class="price">${f.price != null ? f.price + " " + (window._currency || "USD") : "N/A"}</div>
      <div class="meta">
        ${route} · ${dates} · ${(f.airlines || []).join(", ")} · ${stopsLabel}${oj} · Total ${formatDuration(f.total_duration_min)}
      </div>
      ${legsHtml}
    </div>`;
}

function _legTimes(f) {
  const legs = f.legs || [];
  if (!legs.length) return { outDep: "—", outArr: "—" };
  const t = (s) => ((s || "").split(" ").pop()) || "—";
  return { outDep: t(legs[0].departure), outArr: t(legs[legs.length - 1].arrival) };
}

function renderResults(data) {
  const originList = (data.origins_searched || []).map((a) => a.code).join(", ");
  const destList = (data.destinations_searched || []).map((a) => a.code).join(", ");
  $("resultMeta").innerHTML = `
    <span><strong>${data.origin_input}</strong> → <strong>${data.destination_input}</strong></span>
    <span>Airports: ${originList || "—"} → ${destList || "—"}</span>
    <span>Window <strong>${fmtDate(data.date_from)}</strong> – <strong>${fmtDate(data.date_to)}</strong> · Stay <strong>${data.min_days}–${data.max_days}</strong> days</span>
    <span>${data.searches_performed || 0} lookups · ${data.all_results_count || 0} options found${data.stopped_early ? " · partial (limit reached)" : ""}</span>
  `;

  const cur = data.currency || window._currency || "";
  let html = "";
  if (data.cheapest_direct) html += renderFlight(data.cheapest_direct, "best-direct", "Cheapest direct");
  if (data.cheapest_with_stops) html += renderFlight(data.cheapest_with_stops, "best-stops", "Cheapest ≤2 stops / open-jaw");

  const ranked = data.ranked_options || [];
  if (ranked.length) {
    html += `<div class="section-title">All cheapest options (sorted by price)</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>#</th><th>Price</th><th>From → To</th><th>Return apt</th>
      <th>Outbound date</th><th>Out dep</th><th>Out arr</th>
      <th>Return date</th><th>Stay</th><th>Stops</th><th>Airlines</th><th>Type</th>
    </tr></thead><tbody>`;
    ranked.forEach((f, i) => {
      const from = f.origin_airport || "—";
      const to = f.dest_airport || "—";
      const ret = f.return_airport || from;
      const stops = f.stops === 0 ? "Direct" : (f.stops || 0) + " stop(s)";
      const airlines = (f.airlines || []).join(", ") || "—";
      const type = f.open_jaw ? "Open-jaw" : "Round-trip";
      const t = _legTimes(f);
      html += `<tr>
        <td class="rank-cell">${i + 1}</td>
        <td class="price-cell">${f.price != null ? f.price + " " + cur : "—"}</td>
        <td><strong>${from}</strong> → <strong>${to}</strong></td>
        <td>${ret}</td>
        <td>${fmtDate(f.outbound_date) || "—"}</td>
        <td>${t.outDep}</td><td>${t.outArr}</td>
        <td>${fmtDate(f.return_date) || "—"}</td>
        <td>${f.stay_days != null ? f.stay_days + "d" : "—"}</td>
        <td>${stops}</td><td>${airlines}</td><td>${type}</td>
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
      <th>Outbound date</th><th>Cheapest</th><th>From → To</th><th>Stops</th><th>Airlines</th><th>Out times</th>
    </tr></thead><tbody>`;
    dateRows.forEach((row) => {
      const f = row.cheapest;
      const t = _legTimes(f);
      html += `<tr>
        <td><strong>${fmtDate(row.date)}</strong></td>
        <td class="price-cell">${f.price != null ? f.price + " " + cur : "—"}</td>
        <td>${f.origin_airport || "—"} → ${f.dest_airport || "—"}</td>
        <td>${f.stops === 0 ? "Direct" : (f.stops || 0) + " stop(s)"}</td>
        <td>${(f.airlines || []).join(", ") || "—"}</td>
        <td>${t.outDep}→${t.outArr}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  if (data.per_origin_summary && data.per_origin_summary.length) {
    html += `<div class="section-title">Per departure airport (best found)</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>Airport</th><th>City</th><th>Best price</th><th>Stops</th>
      <th>Outbound</th><th>Out times</th><th>Return</th><th>Stay</th><th>Airlines</th><th>Status</th>
    </tr></thead><tbody>`;
    data.per_origin_summary.forEach((row) => {
      const a = row.airport || {};
      const best = row.cheapest_any;
      if (best) {
        const t = _legTimes(best);
        html += `<tr>
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td class="price-cell">${best.price != null ? best.price + " " + cur : "—"}</td>
          <td>${best.stops === 0 ? "Direct" : (best.stops || 0) + " stop(s)"}</td>
          <td>${fmtDate(best.outbound_date) || "—"}</td>
          <td>${t.outDep}→${t.outArr}</td>
          <td>${fmtDate(best.return_date) || "—"}</td>
          <td>${best.stay_days != null ? best.stay_days + "d" : "—"}</td>
          <td>${(best.airlines || []).join(", ") || "—"}</td>
          <td>Verified</td>
        </tr>`;
      } else {
        html += `<tr style="opacity:0.55">
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td colspan="8">—</td>
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
  $("maxSearches").value = s.maxSearches || window.MAX_SEARCHES || 12;
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      readerUrl: $("readerUrl").value.trim(),
      readerKey: $("readerKey").value.trim(),
      maxSearches: parseInt($("maxSearches").value, 10) || window.MAX_SEARCHES || 12,
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

  for (const id of ["readerUrl", "readerKey", "maxSearches"]) {
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
      currency: $("currency").value,
      open_jaw: $("open_jaw").value === "true",
    };
    window._currency = params.currency;
    saveSettings();

    try {
      const data = await runSearch(params, (p) => {
        $("progress").textContent =
          `Searching… ${p.done}/${p.total} lookups · ${p.found} options found` +
          (p.errors ? ` · ${p.errors} failed` : "");
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
