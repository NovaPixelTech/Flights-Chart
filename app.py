#!/usr/bin/env python3
"""
Cheap Flights Finder Web App
Uses fast-flights (Google Flights scraper) to find cheapest direct and connecting flights.
"""

from flask import Flask, render_template, request, jsonify
from datetime import date, timedelta, datetime
from functools import lru_cache
import requests
import re
from typing import Optional, List, Dict, Any, Tuple

app = Flask(__name__)


# ---------- CORS ----------
# The GitHub Pages frontend (docs/) is a different origin and talks to this
# backend directly from the browser, so every response must allow CORS.
@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Max-Age"] = "3600"
    return resp


@app.route("/api/ping")
def api_ping():
    """Health check used by the static frontend to test connectivity."""
    return jsonify({"status": "ok", "service": "cheap-flights-finder-backend"})

# ---------- Airport data ----------
AIRPORTS: Dict[str, dict] = {}
CITY_TO_IATA: Dict[str, List[str]] = {}
MAJOR_AIRPORTS = {
    # Prefer large hubs when multiple match a city
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
}

# When user enters a COUNTRY we expand to these major commercial airports
COUNTRY_AIRPORTS = {
    # Commercial passenger airports (scheduled service). Tiny GA/military/closed fields omitted.
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
}


def load_airports():
    global AIRPORTS, CITY_TO_IATA
    if AIRPORTS:
        return
    try:
        r = requests.get(
            "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json",
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        for v in data.values():
            iata = (v.get("iata") or "").strip().upper()
            if len(iata) != 3:
                continue
            AIRPORTS[iata] = v
            city = (v.get("city") or "").strip().lower()
            if city:
                CITY_TO_IATA.setdefault(city, []).append(iata)
        print(f"Loaded {len(AIRPORTS)} airports")
    except Exception as e:
        print(f"Failed to load airports: {e}")
        # Minimal fallback
        for code, name, city, country in [
            ("JFK", "John F. Kennedy International", "New York", "US"),
            ("LAX", "Los Angeles International", "Los Angeles", "US"),
            ("LHR", "Heathrow", "London", "GB"),
            ("CDG", "Charles de Gaulle", "Paris", "FR"),
            ("NRT", "Narita", "Tokyo", "JP"),
            ("SFO", "San Francisco International", "San Francisco", "US"),
            ("ORD", "O'Hare", "Chicago", "US"),
            ("DXB", "Dubai International", "Dubai", "AE"),
            ("SIN", "Changi", "Singapore", "SG"),
            ("AMS", "Schiphol", "Amsterdam", "NL"),
        ]:
            AIRPORTS[code] = {
                "iata": code,
                "name": name,
                "city": city,
                "country": country,
            }
            CITY_TO_IATA.setdefault(city.lower(), []).append(code)


def resolve_location(text: str) -> Optional[str]:
    """Resolve user input (city name or IATA) to a primary IATA code.
    For countries use resolve_locations() which returns a list."""
    locs = resolve_locations(text)
    return locs[0] if locs else None


def resolve_locations(text: str) -> List[str]:
    """Resolve user input to one or more IATA codes.
    - City / airport code → list with one (or a few major) codes
    - Country → list of major airports of that country
    """
    if not text:
        return []
    text = text.strip()
    upper = text.upper()
    lower = text.lower()

    # Country expansion first: "usa", "USA", "united states" -> all its airports
    if lower in COUNTRY_AIRPORTS:
        return [c for c in COUNTRY_AIRPORTS[lower] if c in AIRPORTS or True]

    if len(upper) == 3 and upper.isalpha() and upper in AIRPORTS:
        return [upper]

    # Exact city match preferring major list
    if lower in MAJOR_AIRPORTS:
        return [c for c in MAJOR_AIRPORTS[lower] if c in AIRPORTS or True]

    if lower in CITY_TO_IATA:
        codes = CITY_TO_IATA[lower]
        for maj in MAJOR_AIRPORTS.get(lower, []):
            if maj in codes:
                return [maj]
        return [codes[0]]

    # Partial / contains match
    for city, codes in CITY_TO_IATA.items():
        if lower in city or city in lower:
            return [codes[0]]

    # Fuzzy airport name
    for code, info in AIRPORTS.items():
        name = (info.get("name") or "").lower()
        if lower in name:
            return [code]

    return []


# ---------- Flight helpers ----------
def parse_simple_dt(dt) -> datetime:
    """Convert fast_flights SimpleDatetime to python datetime."""
    y, m, d = dt.date
    hh, mm = dt.time
    return datetime(y, m, d, hh, mm)


def layover_minutes(flights) -> List[int]:
    """Return list of layover durations in minutes between consecutive legs."""
    lays = []
    for i in range(len(flights) - 1):
        arr = parse_simple_dt(flights[i].arrival)
        dep = parse_simple_dt(flights[i + 1].departure)
        lays.append(int((dep - arr).total_seconds() // 60))
    return lays


def flight_to_dict(f) -> Dict[str, Any]:
    legs = []
    for leg in f.flights:
        legs.append(
            {
                "from": leg.from_airport.code,
                "from_name": leg.from_airport.name,
                "to": leg.to_airport.code,
                "to_name": leg.to_airport.name,
                "departure": f"{leg.departure.date[0]:04d}-{leg.departure.date[1]:02d}-{leg.departure.date[2]:02d} "
                f"{leg.departure.time[0]:02d}:{leg.departure.time[1]:02d}",
                "arrival": f"{leg.arrival.date[0]:04d}-{leg.arrival.date[1]:02d}-{leg.arrival.date[2]:02d} "
                f"{leg.arrival.time[0]:02d}:{leg.arrival.time[1]:02d}",
                "duration_min": leg.duration,
                "plane": getattr(leg, "plane_type", None),
            }
        )
    lays = layover_minutes(f.flights)
    return {
        "price": f.price,
        "airlines": f.airlines,
        "stops": len(f.flights) - 1,
        "legs": legs,
        "layovers_min": lays,
        "total_duration_min": sum(leg.duration for leg in f.flights) + sum(lays),
    }


_GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights"
# Google shows a consent interstitial to EU / datacenter IPs, which breaks the
# scraper. Sending the SOCS cookie skips it. Best-effort and version-guarded.
_CONSENT_COOKIES = {
    "SOCS": "CAISHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiA_LyaBg",
}


def _consent_fetch_integration():
    """Return a fast_flights FetchIntegration that sends a consent cookie.

    Returns None if the installed fast_flights/primp version doesn't support it,
    so callers can fall back to the default fetcher.
    """
    try:
        import primp
        from fast_flights.integrations.base import FetchIntegration
        from fast_flights.querying import Query

        class _ConsentFetch(FetchIntegration):
            def fetch_html(self, q, /):
                client = primp.Client(
                    impersonate="chrome_145",
                    impersonate_os="macos",
                    referer=True,
                    cookie_store=True,
                )
                params = q.params() if isinstance(q, Query) else {"q": q}
                res = client.get(
                    _GOOGLE_FLIGHTS_URL, params=params, cookies=_CONSENT_COOKIES
                )
                return res.text

        return _ConsentFetch()
    except Exception as e:
        print(f"Consent integration unavailable, using default fetch: {e}")
        return None


def search_flights(
    origin: str,
    dest: str,
    outbound_date: str,
    return_date: Optional[str] = None,
    max_stops: int = 2,
    max_layover: int = 180,
    currency: str = "USD",
) -> List[Dict]:
    try:
        from fast_flights import FlightQuery, Passengers, create_query, get_flights
    except Exception as e:
        print(f"Search init error (fast_flights missing): {e}")
        return []

    flights_q = [
        FlightQuery(
            date=outbound_date,
            from_airport=origin,
            to_airport=dest,
            max_stops=max_stops,
            max_layover_minutes=max_layover if max_stops > 0 else None,
        )
    ]
    trip = "one-way"
    if return_date:
        flights_q.append(
            FlightQuery(
                date=return_date,
                from_airport=dest,
                to_airport=origin,
                max_stops=max_stops,
                max_layover_minutes=max_layover if max_stops > 0 else None,
            )
        )
        trip = "round-trip"

    query = create_query(
        flights=flights_q,
        trip=trip,
        seat="economy",
        passengers=Passengers(adults=1),
        currency=currency,
    )
    try:
        integration = _consent_fetch_integration()
        if integration is not None:
            results = get_flights(query, integration=integration)
        else:
            results = get_flights(query)
    except Exception as e:
        print(f"Consent fetch failed ({e}); retrying with default fetcher")
        try:
            results = get_flights(query)
        except Exception as e2:
            print(f"Search error: {e2}")
            return []

    out = []
    for f in results:
        try:
            d = flight_to_dict(f)
            # Extra filter: enforce max layover
            if d["stops"] > 0 and any(l > max_layover for l in d["layovers_min"]):
                continue
            if d["stops"] > max_stops:
                continue
            out.append(d)
        except Exception:
            continue
    # Sort by price
    out.sort(key=lambda x: x["price"] if x["price"] is not None else 999999)
    return out


def cheapest_of(results: List[Dict]) -> Optional[Dict]:
    if not results:
        return None
    return results[0]


# ---------- Routes ----------
@app.route("/")
def index():
    load_airports()
    return render_template("index.html")


@app.route("/api/search", methods=["POST"])
def api_search():
    load_airports()
    data = request.get_json() or {}
    origin_raw = (data.get("origin") or "").strip()
    dest_raw = (data.get("destination") or "").strip()
    currency = (data.get("currency") or "USD").upper()
    allow_open_jaw = bool(data.get("open_jaw", True))

    # Vacation length: single value or range
    min_days = int(data.get("min_days") or data.get("days") or 7)
    max_days = int(data.get("max_days") or min_days)
    min_days = max(1, min(min_days, 30))
    max_days = max(min_days, min(max_days, 30))

    # Date window: single date or range
    date_from_s = (data.get("date_from") or data.get("date") or "").strip()
    date_to_s = (data.get("date_to") or "").strip()

    if not origin_raw or not dest_raw:
        return jsonify({"error": "Origin and destination are required"}), 400

    origins = resolve_locations(origin_raw)
    dests = resolve_locations(dest_raw)
    if not origins:
        return jsonify({"error": f"Could not resolve origin: '{origin_raw}'. Try IATA, city or country (e.g. Germany)."}), 400
    if not dests:
        return jsonify({"error": f"Could not resolve destination: '{dest_raw}'. Try IATA, city or country (e.g. Greece)."}), 400

    # Use full commercial list for countries; still soft-cap for runtime
    is_country_origin = origin_raw.strip().lower() in COUNTRY_AIRPORTS
    is_country_dest = dest_raw.strip().lower() in COUNTRY_AIRPORTS
    MAX_ORIGINS = 30 if is_country_origin else 6
    MAX_DESTS = 15 if is_country_dest else 4
    origins = origins[:MAX_ORIGINS]
    dests = dests[:MAX_DESTS]

    # Build sample outbound dates inside the requested window
    try:
        if date_from_s:
            d_from = datetime.strptime(date_from_s, "%Y-%m-%d").date()
        else:
            d_from = date.today() + timedelta(days=30)
        if date_to_s:
            d_to = datetime.strptime(date_to_s, "%Y-%m-%d").date()
        else:
            d_to = d_from
        if d_to < d_from:
            d_from, d_to = d_to, d_from
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    # Max search window: 31 calendar days inclusive (can span two months, e.g. 15 Nov → 15 Dec)
    calendar_days = (d_to - d_from).days + 1
    if calendar_days > 31:
        return jsonify({
            "error": (
                f"Date window is {calendar_days} calendar days. "
                "Maximum allowed is 31 days (about one month). "
                "You may span two months (e.g. 15 Nov → 15 Dec) as long as the total is ≤ 31 days."
            )
        }), 400

    # Sample up to ~6 outbound dates across the window (keeps searches feasible)
    span = (d_to - d_from).days
    sample_offsets = [0]
    if span > 0:
        steps = min(5, span)
        for i in range(1, steps + 1):
            sample_offsets.append(int(round(i * span / steps)))
    sample_offsets = sorted(set(sample_offsets))
    sample_outbounds = [d_from + timedelta(days=o) for o in sample_offsets]

    # Stay lengths to try
    stay_lengths = list(range(min_days, max_days + 1))

    all_results = []  # every found itinerary
    per_origin = {o: {"direct": None, "connecting": None, "any": None} for o in origins}

    # Limit total searches hard (scraper safety)
    MAX_SEARCHES = 40
    searches_done = 0

    for outbound in sample_outbounds:
        if searches_done >= MAX_SEARCHES:
            break
        for stay in stay_lengths:
            if searches_done >= MAX_SEARCHES:
                break
            ret = outbound + timedelta(days=stay)
            # If return would fall outside a tight window, still allow (user asked for stay length)
            for o in origins:
                if searches_done >= MAX_SEARCHES:
                    break
                for d in dests:
                    if o == d:
                        continue
                    if searches_done >= MAX_SEARCHES:
                        break
                    # Same-airport round trip
                    for max_stops, label in [(0, "direct"), (2, "connecting")]:
                        if searches_done >= MAX_SEARCHES:
                            break
                        res = search_flights(
                            o, d,
                            outbound.isoformat(), ret.isoformat(),
                            max_stops=max_stops, max_layover=180, currency=currency,
                        )
                        searches_done += 1
                        for f in res:
                            if max_stops == 0 and f["stops"] != 0:
                                continue
                            if max_stops > 0 and f["stops"] == 0:
                                continue
                            f["origin_airport"] = o
                            f["return_airport"] = o  # same airport
                            f["dest_airport"] = d
                            f["outbound_date"] = outbound.isoformat()
                            f["return_date"] = ret.isoformat()
                            f["stay_days"] = stay
                            f["open_jaw"] = False
                            all_results.append(f)
                            # track best per origin
                            cur = per_origin[o][label]
                            if cur is None or (f["price"] is not None and (cur["price"] is None or f["price"] < cur["price"])):
                                per_origin[o][label] = f
                            cur_any = per_origin[o]["any"]
                            if cur_any is None or (f["price"] is not None and (cur_any["price"] is None or f["price"] < cur_any["price"])):
                                per_origin[o]["any"] = f

    # Optional open-jaw: different German return airport (only a few top origins to stay fast)
    if allow_open_jaw and len(origins) > 1 and searches_done < MAX_SEARCHES:
        top_origins = origins[:5]
        for outbound in sample_outbounds[:2]:
            for stay in stay_lengths[:2]:
                ret = outbound + timedelta(days=stay)
                for o_out in top_origins:
                    for o_ret in top_origins:
                        if o_out == o_ret:
                            continue
                        if searches_done >= MAX_SEARCHES:
                            break
                        for d in dests[:2]:
                            # multi-city style: out o_out→d, return d→o_ret
                            # We approximate by searching one-way out + one-way return and summing
                            # (true open-jaw pricing needs multi-city; this is a practical estimate)
                            out_legs = search_flights(o_out, d, outbound.isoformat(), None, max_stops=1, max_layover=180, currency=currency)
                            searches_done += 1
                            ret_legs = search_flights(d, o_ret, ret.isoformat(), None, max_stops=1, max_layover=180, currency=currency)
                            searches_done += 1
                            if out_legs and ret_legs:
                                best_out = out_legs[0]
                                best_ret = ret_legs[0]
                                if best_out.get("price") is not None and best_ret.get("price") is not None:
                                    combined = {
                                        "price": best_out["price"] + best_ret["price"],
                                        "airlines": list(set((best_out.get("airlines") or []) + (best_ret.get("airlines") or []))),
                                        "stops": (best_out.get("stops") or 0) + (best_ret.get("stops") or 0),
                                        "legs": (best_out.get("legs") or []) + (best_ret.get("legs") or []),
                                        "layovers_min": (best_out.get("layovers_min") or []) + (best_ret.get("layovers_min") or []),
                                        "total_duration_min": (best_out.get("total_duration_min") or 0) + (best_ret.get("total_duration_min") or 0),
                                        "origin_airport": o_out,
                                        "return_airport": o_ret,
                                        "dest_airport": d,
                                        "outbound_date": outbound.isoformat(),
                                        "return_date": ret.isoformat(),
                                        "stay_days": stay,
                                        "open_jaw": True,
                                    }
                                    all_results.append(combined)

    all_results.sort(key=lambda x: x["price"] if x["price"] is not None else 999999)
    directs = [r for r in all_results if not r.get("open_jaw") and r.get("stops") == 0]
    connecting = [r for r in all_results if r.get("stops", 0) > 0 or r.get("open_jaw")]

    def airport_info(code):
        info = AIRPORTS.get(code, {})
        return {
            "code": code,
            "name": info.get("name"),
            "city": info.get("city"),
            "country": info.get("country"),
        }

    per_origin_list = []
    for o in origins:
        best = per_origin[o]["any"]
        per_origin_list.append({
            "airport": airport_info(o),
            "cheapest_any": best,
            "cheapest_direct": per_origin[o]["direct"],
            "cheapest_connecting": per_origin[o]["connecting"],
            "has_flights": best is not None,
        })
    # sort: those with flights first, by price
    per_origin_list.sort(key=lambda x: (
        0 if x["has_flights"] else 1,
        x["cheapest_any"]["price"] if x["cheapest_any"] and x["cheapest_any"].get("price") is not None else 999999
    ))

    return jsonify(
        {
            "origin_input": origin_raw,
            "destination_input": dest_raw,
            "origins_searched": [airport_info(c) for c in origins],
            "destinations_searched": [airport_info(c) for c in dests],
            "date_from": d_from.isoformat(),
            "date_to": d_to.isoformat(),
            "min_days": min_days,
            "max_days": max_days,
            "sample_outbounds": [d.isoformat() for d in sample_outbounds],
            "currency": currency,
            "searches_performed": searches_done,
            "cheapest_direct": directs[0] if directs else None,
            "cheapest_with_stops": connecting[0] if connecting else None,
            "ranked_options": all_results[:15],
            "per_origin_summary": per_origin_list,
            "all_results_count": len(all_results),
            "note": (
                "Country inputs expand to commercial passenger airports of that country. "
                "Date window is limited to max 31 calendar days (may span two months). "
                "Dates inside the window are sampled (not every single day) to stay within rate limits. "
                "Open-jaw (different outbound/return airport) is estimated from separate one-ways. "
                "Airports with no results are still listed. Prices are live Google Flights estimates."
            ),
        }
    )


@app.route("/api/resolve")
def api_resolve():
    load_airports()
    q = request.args.get("q", "")
    code = resolve_location(q)
    if not code:
        return jsonify({"resolved": None})
    info = AIRPORTS.get(code, {})
    return jsonify(
        {
            "resolved": code,
            "name": info.get("name"),
            "city": info.get("city"),
            "country": info.get("country"),
        }
    )


if __name__ == "__main__":
    load_airports()
    app.run(host="0.0.0.0", port=5000, debug=False)
