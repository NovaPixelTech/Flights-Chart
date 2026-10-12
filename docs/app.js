/* Cheap Flights Finder — static GitHub Pages frontend.
 * Airport/country resolution happens in the browser;
 * live flight prices come from the deployed Flask backend (see config.js). */

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
  // Minimal fallback so the page still functions
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
 *  UI state / helpers
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);

function getBackend() {
  const val = ($("backendUrl").value || "").trim();
  return val.replace(/\/+$/, "");
}

const SAVED_KEY = "flightsfinder-backend";

function initBackendInput() {
  const start = (window.FLIGHT_BACKEND || "").trim() ||
                localStorage.getItem(SAVED_KEY) || "";
  $("backendUrl").value = start;
}

function saveBackend() {
  try { localStorage.setItem(SAVED_KEY, getBackend()); } catch (e) {}
}

function formatDuration(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + "h " + m + "m";
}

function fmtDate(iso) { return (iso || "").slice(0, 10); }
function legTimes(f) {
  const legs = f.legs || [];
  if (!legs.length) return { outDep: "—", outArr: "—", retDep: "—", retArr: "—" };
  const first = legs[0];
  const last = legs[legs.length - 1];
  const t = (s) => ((s || "").split(" ").pop()) || s || "—";
  return {
    outDep: t(first.departure),
    outArr: t(first.arrival),
    retDep: legs.length > 1 ? t(last.departure) : "—",
    retArr: legs.length > 1 ? t(last.arrival) : "—",
  };
}

/* ------------------------------------------------------------------ *
 *  Backend health check
 * ------------------------------------------------------------------ */
async function pingBackend() {
  const pill = $("backendPill"), txt = $("backendPillText");
  const base = getBackend();
  if (!base) {
    pill.className = "pill bad";
    txt.textContent = "backend: not configured";
    return;
  }
  pill.className = "pill";
  txt.textContent = "backend: checking…";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const r = await fetch(base + "/api/ping", { signal: ctrl && ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.status === "ok") {
      pill.className = "pill ok";
      txt.textContent = "backend: connected";
    } else {
      pill.className = "pill bad";
      txt.textContent = "backend: responded with error";
    }
  } catch (e) {
    pill.className = "pill bad";
    txt.textContent = "backend: unreachable";
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  const route = f.origin_airport
    ? `${f.origin_airport}${f.return_airport && f.return_airport !== f.origin_airport ? " ↩ " + f.return_airport : ""} → ${f.dest_airport || ""}`
    : "";
  const dates = f.outbound_date ? `${fmtDate(f.outbound_date)} → ${fmtDate(f.return_date)} (${f.stay_days || "?"}d)` : "";
  const oj = f.open_jaw ? " · Open-jaw" : "";
  return `
    <div class="flight-card ${badgeClass}">
      <span class="badge ${badgeClass === "best-direct" ? "green" : "blue"}">${badgeText}</span>
      <div class="price">${f.price != null ? f.price + " " + (window._currency || "USD") : "N/A"}</div>
      <div class="meta">
        ${route ? route + " · " : ""}${dates ? dates + " · " : ""}${(f.airlines || []).join(", ")} · ${stopsLabel}${oj} · Total ${formatDuration(f.total_duration_min)}
      </div>
      ${legsHtml}
    </div>`;
}

/* ------------------------------------------------------------------ *
 *  Search
 * ------------------------------------------------------------------ */
async function doSearch() {
  const base = getBackend();
  if (!base) {
    throw new Error(
      "⚠️ No flight backend configured yet.\n\n" +
      "GitHub Pages is static — live prices are fetched from the Flask backend (app.py) " +
      "which you deploy on Render / Railway / Fly.io.\n\n" +
      "Deploy it, then paste its URL in ⚙️ Backend settings (or edit docs/config.js). " +
      "See README.md → “Deploy the backend”."
    );
  }
  const payload = {
    origin: $("origin").value.trim(),
    destination: $("destination").value.trim(),
    min_days: parseInt($("min_days").value, 10) || 6,
    max_days: parseInt($("max_days").value, 10) || 7,
    date_from: $("date_from").value || null,
    date_to: $("date_to").value || null,
    currency: $("currency").value,
    open_jaw: $("open_jaw").value === "true",
  };
  window._currency = payload.currency;
  saveBackend();

  const res = await fetch(base + "/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data && data.error) ||
      `Search failed (HTTP ${res.status}). ` +
      "Check that the backend URL is correct and that CORS is enabled on it."
    );
  }
  return data;
}

function renderResults(data) {
  const originList = (data.origins_searched || []).map((a) => a.code).join(", ");
  const destList = (data.destinations_searched || []).map((a) => a.code).join(", ");
  $("resultMeta").innerHTML = `
    <span><strong>${data.origin_input}</strong> → <strong>${data.destination_input}</strong></span>
    <span>Airports: ${originList || "—"} → ${destList || "—"}</span>
    <span>Window <strong>${fmtDate(data.date_from)}</strong> – <strong>${fmtDate(data.date_to)}</strong> · Stay <strong>${data.min_days}–${data.max_days}</strong> days</span>
    <span>${data.searches_performed || 0} searches · ${data.all_results_count || 0} options found</span>
  `;

  const cur = data.currency || window._currency || "";
  let html = "";
  if (data.cheapest_direct) {
    html += renderFlight(data.cheapest_direct, "best-direct", "Cheapest direct");
  }
  if (data.cheapest_with_stops) {
    html += renderFlight(data.cheapest_with_stops, "best-stops", "Cheapest ≤2 stops / open-jaw");
  }

  const ranked = data.ranked_options || [];
  if (ranked.length) {
    html += `<div class="section-title">All cheapest options (sorted by price) — with flight times</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>#</th><th>Price</th><th>From → To</th><th>Return apt</th>
      <th>Outbound date</th><th>Out dep</th><th>Out arr</th>
      <th>Return date</th><th>Ret dep</th><th>Ret arr</th>
      <th>Stay</th><th>Stops</th><th>Airlines</th><th>Type</th>
    </tr></thead><tbody>`;
    ranked.forEach((f, i) => {
      const from = f.origin_airport || "—";
      const to = f.dest_airport || "—";
      const ret = f.return_airport || from;
      const stops = f.stops === 0 ? "Direct" : (f.stops || 0) + " stop(s)";
      const airlines = (f.airlines || []).join(", ") || "—";
      const type = f.open_jaw ? "Open-jaw" : "Round-trip";
      const t = legTimes(f);
      html += `<tr>
        <td class="rank-cell">${i + 1}</td>
        <td class="price-cell">${f.price != null ? f.price + " " + cur : "—"}</td>
        <td><strong>${from}</strong> → <strong>${to}</strong></td>
        <td>${ret}</td>
        <td>${fmtDate(f.outbound_date) || "—"}</td>
        <td>${t.outDep}</td><td>${t.outArr}</td>
        <td>${fmtDate(f.return_date) || "—"}</td>
        <td>${t.retDep}</td><td>${t.retArr}</td>
        <td>${f.stay_days != null ? f.stay_days + "d" : "—"}</td>
        <td>${stops}</td><td>${airlines}</td><td>${type}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  } else {
    html += `<div class="flight-card"><div class="empty">No flights found in the sampled dates/airports.</div></div>`;
  }

  if (data.per_origin_summary && data.per_origin_summary.length) {
    html += `<div class="section-title">Per departure airport (best found) — with times</div>`;
    html += `<div class="results-table-wrap"><table class="results-table"><thead><tr>
      <th>Airport</th><th>City</th><th>Best price</th><th>Stops</th>
      <th>Outbound</th><th>Out times</th><th>Return</th><th>Stay</th><th>Airlines</th><th>Status</th>
    </tr></thead><tbody>`;
    data.per_origin_summary.forEach((row) => {
      const a = row.airport || {};
      const best = row.cheapest_any;
      if (best) {
        const t = legTimes(best);
        const times = t.outDep + "→" + t.outArr;
        html += `<tr>
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td class="price-cell">${best.price != null ? best.price + " " + cur : "—"}</td>
          <td>${best.stops === 0 ? "Direct" : (best.stops || 0) + " stop(s)"}</td>
          <td>${fmtDate(best.outbound_date) || "—"}</td>
          <td>${times}</td>
          <td>${fmtDate(best.return_date) || "—"}</td>
          <td>${best.stay_days != null ? best.stay_days + "d" : "—"}</td>
          <td>${(best.airlines || []).join(", ") || "—"}</td>
          <td>Verified</td>
        </tr>`;
      } else {
        html += `<tr style="opacity:0.55">
          <td><strong>${a.code || "—"}</strong></td>
          <td>${a.city || a.name || "—"}</td>
          <td colspan="7">—</td>
          <td>No verified flights</td>
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

function wire() {
  initBackendInput();

  // Default date window: ~45 days out, ≤31 calendar days
  const d1 = new Date();
  d1.setDate(d1.getDate() + 45);
  const d2 = new Date(d1);
  d2.setDate(d2.getDate() + 30);
  $("date_from").value = d1.toISOString().slice(0, 10);
  $("date_to").value = d2.toISOString().slice(0, 10);

  bindResolveHint("origin", "originHint");
  bindResolveHint("destination", "destinationHint");

  $("backendUrl").addEventListener("change", pingBackend);

  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("errorBox").style.display = "none";
    $("results").style.display = "none";
    const btn = $("submitBtn");
    btn.disabled = true;
    $("btnText").style.display = "none";
    $("btnSpin").style.display = "inline-block";
    try {
      const data = await doSearch();
      renderResults(data);
      $("results").style.display = "block";
    } catch (err) {
      $("errorBox").textContent = err.message || "Something went wrong";
      $("errorBox").style.display = "block";
    } finally {
      btn.disabled = false;
      $("btnText").style.display = "inline";
      $("btnSpin").style.display = "none";
    }
  });

  // Boot checks
  (async () => {
    try { await loadAirports(); } catch (e) {}
    const n = Object.keys(AIRPORTS).length;
    const pill = $("airportPill"), txt = $("airportPillText");
    pill.className = "pill " + (n ? "ok" : "bad");
    txt.textContent = `airports: ${n ? n + " loaded" : "unavailable"}`;
  })();
  pingBackend();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}