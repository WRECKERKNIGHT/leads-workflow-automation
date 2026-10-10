/**
 * Google Places (New) Text Search + Place Details adapter.
 *
 * Every free web-search route we tried is bot-blocked: DuckDuckGo returns 403,
 * Brave rate-limits, Mojeek and Startpage render client-side, and the Google
 * Maps listing data sits behind an RPC call rather than in the HTML. The Places
 * API is the one authoritative source that returns a school's own `website`
 * field directly, so it is worth a metered key.
 *
 * Crucially this adapter only ever returns *candidates*. Nothing here decides
 * that a domain belongs to a school — that judgement stays in
 * `siteBelongsToSchool()`, so paying for a Places key can only widen the funnel,
 * never weaken the gate that rejected the cruise-line and software domains.
 *
 * Requires GOOGLE_PLACES_API_KEY with the Places API (New) enabled. When the key
 * is absent every function resolves to an empty result, so callers need no
 * special-casing.
 */
import { config } from "@/lib/config";
import type { DirectoryHit, DirectoryQuery } from "@/lib/scraping/directory";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

/** Field mask for search results: enough to rank and to fetch details later. */
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.primaryType",
  "places.location",
];

/** Field mask for details: adds the fields the organizer actually stores. */
const DETAIL_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "websiteUri",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "primaryType",
  "types",
  "location",
];

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface PlaceResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  primaryType?: string;
  types?: string[];
  location?: { latitude: number; longitude: number };
}

function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function component(
  place: PlaceResult,
  ...types: string[]
): string | null {
  const hit = place.addressComponents?.find((c) =>
    types.some((t) => c.types.includes(t))
  );
  return hit?.longText ?? hit?.shortText ?? null;
}

function placeCity(place: PlaceResult): string | null {
  return (
    component(place, "locality", "postal_town", "administrative_area_level_3") ??
    component(place, "sublocality_level_1", "sublocality", "neighborhood")
  );
}

function placeState(place: PlaceResult): string | null {
  return component(place, "administrative_area_level_1");
}

/** Only a genuine school-ish primary type is worth returning as a candidate. */
function looksLikeSchool(place: PlaceResult): boolean {
  const types = [place.primaryType, ...(place.types ?? [])].filter(Boolean) as string[];
  return types.some(
    (t) =>
      t === "school" ||
      t === "primary_school" ||
      t === "secondary_school" ||
      t === "university"
  );
}

async function placesFetch<T>(
  path: string,
  key: string,
  init: { method: "POST" | "GET"; body?: unknown; fieldMask: string[] }
): Promise<T | null> {
  const url = new URL(path);
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": init.fieldMask.join(","),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      // Over-quota or a disabled API is worth surfacing, but never fatal to a run.
      console.warn(`[places] ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[places] request failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function buildTextQuery(q: DirectoryQuery): string {
  const parts = [q.schoolName];
  if (q.city) parts.push(q.city);
  if (q.state) parts.push(q.state);
  return parts.filter(Boolean).join(" ");
}

/**
 * Text-search for the school, then hydrate each plausible hit with details so
 * the official `websiteUri` is available.
 */
export async function lookupGooglePlaces(q: DirectoryQuery): Promise<DirectoryHit> {
  const empty: DirectoryHit = {
    source: "google_maps",
    listingUrl: null,
    mapsUrl: null,
    phone: null,
    website: null,
    emails: [],
    matchedOn: "google places",
    ok: false,
  };
  const key = config.googlePlacesApiKey;
  if (!key) return empty;

  const data = await placesFetch<{ places?: PlaceResult[] }>(TEXT_SEARCH_URL, key, {
    method: "POST",
    fieldMask: SEARCH_FIELD_MASK,
    body: {
      textQuery: buildTextQuery(q),
      languageCode: "en",
      regionCode: "IN",
      maxResultCount: 5,
    },
  });
  const places = data?.places ?? [];
  if (places.length === 0) {
    return { ...empty, matchedOn: `google places: no match for "${buildTextQuery(q)}"` };
  }

  // Prefer hits that look like schools, then the closest one when we have the
  // lead's own coordinates to compare against.
  const scored = places
    .filter(looksLikeSchool)
    .map((p) => {
      let score = 0;
      const city = placeCity(p);
      if (q.city && city && city.toLowerCase().includes(q.city.toLowerCase().slice(0, 6))) score += 3;
      if (q.state && placeState(p)?.toLowerCase() === q.state.toLowerCase()) score += 2;
      if (p.location && typeof q.lat === "number" && typeof q.lon === "number") {
        const km = haversineKm(q.lat, q.lon, p.location.latitude, p.location.longitude);
        score += Math.max(0, 3 - km / 10);
        if (km < 2) score += 4;
      }
      if (p.websiteUri) score += 1;
      return { place: p, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.place;
  if (!best) {
    return { ...empty, matchedOn: `google places: no school-type result for "${buildTextQuery(q)}"` };
  }

  // Hydrate for the authoritative website field when the search response lacked it.
  let website = best.websiteUri ?? null;
  if (!website && best.id) {
    const detail = await placesFetch<PlaceResult>(`${DETAILS_URL}/${best.id}`, key, {
      method: "GET",
      fieldMask: DETAIL_FIELD_MASK,
    });
    website = detail?.websiteUri ?? website;
  }

  const city = placeCity(best);
  const state = placeState(best);
  return {
    source: "google_maps",
    listingUrl: website,
    mapsUrl: best.googleMapsUri ?? null,
    phone: cleanPhone(best.nationalPhoneNumber ?? best.internationalPhoneNumber),
    website,
    emails: [],
    matchedOn: `google places: "${best.displayName?.text ?? "?"}"${
      city ? ` in ${city}` : ""
    }${state ? `, ${state}` : ""}`,
    ok: Boolean(website || best.googleMapsUri),
  };
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
