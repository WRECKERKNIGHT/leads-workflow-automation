import { fetchPage } from "./web";
import { webSearch } from "./search";
import { complete } from "@/lib/llm/openrouter";
import { config } from "@/lib/config";
import { normalizeEmail, isJunkEmail, isJunkDomain, registrableDomain, siteBelongsToSchool, wordTokens, distinctiveTokens } from "@/lib/validation";
import { lookupGooglePlaces } from "@/lib/scraping/google-places";
import type { ContactSource } from "@/agents/types";

/**
 * Directory enrichment — Google Maps and JustDial.
 *
 * Both sites render their listings with JavaScript and block plain fetches, so
 * the strategy is: locate the real listing URL through a search engine scoped to
 * the directory, then read whatever contact data that page exposes. Everything
 * returned here is tagged with its source so a lead's provenance is always
 * visible on the dashboard, and every address still has to pass the same
 * sendability gate as a website-scraped one.
 */

export interface DirectoryHit {
  source: ContactSource;
  /** The directory listing page we found. */
  listingUrl: string | null;
  /** A link a human can open to confirm the school exists. */
  mapsUrl: string | null;
  phone: string | null;
  website: string | null;
  emails: string[];
  /** Why we believe this listing is the same school. */
  matchedOn: string;
  ok: boolean;
}

const PHONE_RE = /(?:\+?91[\s-]?)?(?:[6-9]\d{4}[\s.-]?\d{5})/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function cleanPhoneList(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(PHONE_RE)) {
    const p = cleanPhone(m[0]);
    if (p) out.add(p);
  }
  return [...out];
}

function cleanEmailList(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = normalizeEmail(m[0]);
    if (e && !isJunkEmail(e) && !isJunkDomain(e)) out.add(e);
  }
  return [...out];
}

/** Read contact bits out of whatever a directory page happens to expose. */
function readListing(html: string): { phone: string | null; website: string | null; emails: string[] } {
  const phones = cleanPhoneList(html);

  // Directory pages wrap the business website in a redirect or a labelled link.
  let website: string | null = null;
  const siteCandidates = [
    ...html.matchAll(/<a[^>]+href="(https?:\/\/(?:www\.)?[a-z0-9][a-z0-9.-]{4,60}\.[a-z]{2,}[^"]*)"[^>]*>([^<]{0,40})<\/a>/gi),
  ]
    .map((m) => ({ url: m[1], label: m[2] }))
    .filter((c) => /website|visit|official site|homepage/i.test(c.label))
    .map((c) => c.url);
  for (const cand of siteCandidates) {
    if (isJunkDomain(registrableDomain(cand))) continue;
    website = cand;
    break;
  }

  return { phone: phones[0] ?? null, website, emails: cleanEmailList(html) };
}

/**
 * Does this directory result look like our school, or a different one with a
 * similar name? Requires a distinctive name word to appear in the listing text.
 */
function listingMatchesSchool(text: string, schoolName: string): { ok: boolean; matchedOn: string } {
  const haystack = wordTokens(text);
  if (!haystack.length) return { ok: false, matchedOn: "listing had no readable text" };
  const name = distinctiveTokens(schoolName);
  if (!name.length) return { ok: true, matchedOn: "school name had no distinctive words" };
  const shared = name.filter((t) => haystack.includes(t));
  if (shared.length === name.length) return { ok: true, matchedOn: `all name words present (${shared.join(", ")})` };
  if (shared.length >= Math.max(1, Math.ceil(name.length / 2))) {
    return { ok: true, matchedOn: `name words matched (${shared.join(", ")})` };
  }
  return { ok: false, matchedOn: `only matched ${shared.length ? shared.join(", ") : "nothing"} of "${name.join(", ")}"` };
}

export interface DirectoryQuery {
  schoolName: string;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  /** Lead coordinates, used to rank same-named schools by proximity. */
  lat?: number | null;
  lon?: number | null;
}

/** Look the school up on JustDial. */
export async function lookupJustDial(q: DirectoryQuery): Promise<DirectoryHit> {
  const place = [q.city, q.state].filter(Boolean).join(" ") || q.schoolName;
  const base: DirectoryHit = {
    source: "justdial",
    listingUrl: null,
    mapsUrl: null,
    phone: null,
    website: null,
    emails: [],
    matchedOn: "",
    ok: false,
  };

  try {
    const results = await webSearch(`site:justdial.com "${q.schoolName}" ${place}`, 6);
    const listing = results.find((r) => /justdial\.com\/.+\/p\//i.test(r.url)) ?? results[0];
    if (!listing) return { ...base, matchedOn: "no JustDial listing found" };

    const page = await fetchPage(listing.url, { timeoutMs: 15000 });
    if (!page.ok || !page.html) return { ...base, listingUrl: listing.url, matchedOn: "JustDial page could not be read" };

    const text = `${listing.title} ${listing.snippet} ${page.title ?? ""}`;
    const match = listingMatchesSchool(text, q.schoolName);
    if (!match.ok) return { ...base, listingUrl: listing.url, matchedOn: `rejected — ${match.matchedOn}` };

    const read = readListing(page.html);
    return {
      ...base,
      ok: true,
      listingUrl: listing.url,
      matchedOn: `JustDial listing confirmed (${match.matchedOn})`,
      phone: read.phone,
      website: read.website,
      emails: read.emails,
    };
  } catch (err) {
    return { ...base, matchedOn: `JustDial lookup failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Look the school up on Google Maps. The listing is JavaScript-rendered, so we
 * confirm the place exists and capture whatever the served HTML exposes, then
 * always hand back a maps_url so a human can eyeball the listing.
 */
export async function lookupGoogleMaps(q: DirectoryQuery): Promise<DirectoryHit> {
  const place = [q.schoolName, q.city, q.state].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(place)}`;
  const base: DirectoryHit = {
    source: "google_maps",
    listingUrl: mapsUrl,
    mapsUrl,
    phone: null,
    website: null,
    emails: [],
    matchedOn: "",
    ok: false,
  };

  try {
    // A search-engine lookup gives us a readable title/snippet for the place,
    // which is how we confirm the name actually exists on Maps.
    const results = await webSearch(`${q.schoolName} ${q.city ?? ""} ${q.state ?? ""} site:google.com/maps`, 5);
    const snippetText = results.map((r) => `${r.title} ${r.snippet}`).join(" ");
    const match = listingMatchesSchool(`${q.schoolName} ${snippetText}`, q.schoolName);

    // Maps phone numbers are exposed in the served HTML even though the rest of
    // the card is client-rendered.
    const page = await fetchPage(mapsUrl, { timeoutMs: 15000 });
    const phone = page.ok ? cleanPhoneList(page.html)[0] ?? null : null;

    return {
      ...base,
      ok: true,
      phone,
      matchedOn: match.ok
        ? `Google Maps place located (${match.matchedOn})`
        : `Google Maps link built for manual check — ${match.matchedOn}`,
    };
  } catch (err) {
    return { ...base, matchedOn: `Google Maps lookup failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Try to locate the school's real website when the one we hold is not proven.
 * Only returns a website that `siteBelongsToSchool` accepts for this school.
 */
/**
 * Turn coordinates into a city name.
 *
 * Almost every discovered school has a latitude and longitude but no city, and
 * a city is what makes a name searchable: "Carmel High School" exists in many
 * states, and without a place to search the pipeline has nothing to
 * disambiguate with. Nominatim reverse lookup is free and cached per day.
 */
const reverseCache = new Map<string, { city: string | null; state: string | null }>();

export async function reverseGeocode(
  lat: number | null | undefined,
  lon: number | null | undefined
): Promise<{ city: string | null; state: string | null }> {
  if (lat == null || lon == null) return { city: null, state: null };
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = reverseCache.get(key);
  if (hit) return hit;

  const out = { city: null as string | null, state: null as string | null };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    // The configured endpoint is the forward /search URL; reverse lookups need
    // the bare host.
    const base = config.nominatimUrl.replace(/\/search\/?$/, "").replace(/\/$/, "");
    const res = await fetch(
      // Without accept-language Nominatim answers in the local script (Burmese,
      // Kannada, Telugu…), which is useless for matching against English state
      // names in the location-conflict check.
      `${base}/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&accept-language=en`,
      { headers: { "User-Agent": "AgencyOS/1.0 (school outreach research)" }, signal: ctrl.signal }
    );
    clearTimeout(t);
    if (res.ok) {
      const json = (await res.json()) as {
        address?: Record<string, string | undefined>;
        display_name?: string;
      };
      const a = json.address ?? {};
      out.city =
        a.city ??
        a.town ??
        a.village ??
        a.municipality ??
        a.county ??
        a.city_district ??
        a.state_district ??
        // The display name is "…, neighbourhood, city, state, country", so the
        // city is the second to last component.
        (json.display_name ? json.display_name.split(",").map((p) => p.trim()).slice(-3, -1)[0] : null) ??
        null;
      out.state = a.state ?? (json.display_name ? json.display_name.split(",").map((p) => p.trim()).slice(-2)[0] : null) ?? null;
    }
  } catch {
    /* best effort */
  }
  reverseCache.set(key, out);
  return out;
}

/**
 * Ask the model to suggest a school's own website, then put each suggestion
 * through exactly the same verification as a search result.
 *
 * This exists because DuckDuckGo and Bing both refuse their HTML to bots, so
 * search often degrades to an unordered handful of domains and real school
 * sites are simply never offered. A hallucinated guess is harmless here: it is
 * fetched and checked, and discarded unless it really is the school's site.
 */
export async function suggestWebsiteByModel(q: DirectoryQuery): Promise<string[]> {
  if (config.mockMode || !config.openrouterApiKey) return [];
  const where = [q.city, q.state].filter(Boolean).join(", ");
  try {
    const { text } = await complete(
      [
        {
          role: "system",
          content:
            "You list the official website URLs of Indian schools. Reply with a bare list of " +
            "domains, one per line, no commentary, no URLs formatting. Only list the school's own " +
            "website. If you do not know it, reply with the single word NONE.",
        },
        {
          role: "user",
          content: `Official website domain(s) for "${q.schoolName}" in ${where || "India"}.`,
        },
      ],
      { temperature: 0, maxTokens: 200 }
    );

    /**
     * The model tends to answer with a short explanation rather than a bare
     * list, so domains are pulled out of the whole response instead of being
     * read line by line. Every candidate is still verified, so a domain the
     * model merely mentioned in passing is discarded unless it checks out.
     */
    const found =
      text.match(/\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})\b/gi) ?? [];
    return [
      ...new Set(
        found
          .map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
          .filter((d) => !isJunkDomain(registrableDomain(d)))
      ),
    ].slice(0, 6);
  } catch {
    return [];
  }
}

export async function findVerifiedWebsite(q: DirectoryQuery): Promise<{ website: string | null; source: ContactSource; reason: string }> {
  const place = [q.city, q.state].filter(Boolean).join(" ");
  const queries = [
    `${q.schoolName} ${place} official website`,
    `"${q.schoolName}" ${place} contact email admission`,
    `${q.schoolName} ${place} site:ac.in OR site:edu.in`,
  ];

  const nameTokens = distinctiveTokens(q.schoolName);
  const seen = new Set<string>();

  const verifyLive = async (
    candidateUrl: string
  ): Promise<{ ok: true; website: string; reason: string } | { ok: false }> => {
    if (seen.has(candidateUrl)) return { ok: false };
    seen.add(candidateUrl);
    const page = await fetchPage(candidateUrl, { timeoutMs: 12000 });
    if (!page.ok) return { ok: false };
    const live = siteBelongsToSchool(page.finalUrl || candidateUrl, q.schoolName, {
      pageTitle: page.title,
      pageText: page.text,
      state: q.state,
      address: q.address,
    });
    if (!live.owned) return { ok: false };
    return { ok: true, website: page.finalUrl || candidateUrl, reason: live.reason };
  };

  for (const query of queries) {
    let results: Awaited<ReturnType<typeof webSearch>> = [];
    try {
      results = await webSearch(query, 12);
    } catch {
      continue;
    }
    if (!results.length) continue;

    /**
     * DuckDuckGo and Bing both serve their HTML to bots these days, so the
     * search often degrades to a bare list of domains with no titles or
     * snippets. Ranking the candidates by how much of the school's own name
     * their hostname carries is therefore the only cheap signal available —
     * the actual decision is always made by fetching the page.
     */
    const ranked = results
      .map((r) => {
        let host: string;
        try {
          host = new URL(r.url).hostname;
        } catch {
          return null;
        }
        if (isJunkDomain(registrableDomain(host))) return null;
        const blob = host.toLowerCase().replace(/[^a-z0-9]/g, "");
        const hits = nameTokens.filter((t) => t.length >= 4 && blob.includes(t)).length;
        const joined = nameTokens.join("");
        const joinedHit = joined.length >= 8 && blob.includes(joined) ? 2 : 0;
        const institutional = /\.(ac\.in|edu\.in|edu|ac|gov\.in|sch\.in)$/i.test(host) ? 1 : 0;
        const hasTitle = r.title && r.title !== r.url ? 1 : 0;
        return { r, host, score: hits * 2 + joinedHit + institutional + hasTitle };
      })
      .filter((x): x is { r: (typeof results)[number]; host: string; score: number } => x !== null)
      .sort((a, b) => b.score - a.score);

    for (const cand of ranked) {
      // The live page is the only authority: a domain match alone is how
      // radiant.in (an IT distributor) got attached to Radiant School.
      const v = await verifyLive(cand.r.url);
      if (!v.ok) continue;
      return {
        website: v.website,
        source: /justdial/i.test(cand.host) ? "justdial" : "web_search",
        reason: v.reason,
      };
    }
  }

  // Search came up short — let the model propose candidates, then verify them
  // with the same gate. Nothing it suggests is trusted without the page check.
  for (const guess of await suggestWebsiteByModel(q)) {
    const v = await verifyLive(`https://${guess}/`);
    if (!v.ok) continue;
    return { website: v.website, source: "web_search", reason: `model-suggested, confirmed — ${v.reason}` };
  }

  return {
    website: null,
    source: "web_search",
    reason: `searched ${seen.size} candidate site(s); none could be confirmed as ${q.schoolName}'s own website`,
  };
}

/**
 * The authoritative discovery path: ask Google Places for the school, then hold
 * whatever website it reports to exactly the same live-page gate as every other
 * candidate. Runs first because a Places `websiteUri` is a curated field, while
 * the free web-search fallbacks below it are mostly blocked scrapes.
 */
export async function findVerifiedWebsiteViaPlaces(
  q: DirectoryQuery
): Promise<{ website: string | null; source: ContactSource; reason: string }> {
  if (!config.googlePlacesApiKey) {
    return { website: null, source: "google_maps", reason: "google places not configured" };
  }
  const hit = await lookupGooglePlaces(q);
  if (!hit.website) {
    return { website: null, source: "google_maps", reason: hit.matchedOn };
  }
  const page = await fetchPage(hit.website, { timeoutMs: 12000 });
  if (!page.ok) {
    return {
      website: null,
      source: "google_maps",
      reason: `places reported ${hit.website} but the page could not be fetched`,
    };
  }
  const verdict = siteBelongsToSchool(page.finalUrl || hit.website, q.schoolName, {
    pageTitle: page.title,
    pageText: page.text,
    state: q.state,
    address: q.address,
  });
  if (!verdict.owned) {
    return {
      website: null,
      source: "google_maps",
      reason: `places reported ${hit.website} but it failed the ownership check — ${verdict.reason}`,
    };
  }
  return {
    website: page.finalUrl || hit.website,
    source: "google_maps",
    reason: `google places, confirmed — ${hit.matchedOn}; ${verdict.reason}`,
  };
}
