import { config } from "@/lib/config";
import { runAgentTask } from "@/lib/agents/runner";
import { createInstitution, createMission, pushOfficeEvent, logAgent, institutionExists } from "@/lib/db/repo";
import { CATEGORY_CONFIG } from "@/agents/types";
import { isForeignLead } from "@/lib/validation";
import type { InstitutionCategory } from "@/agents/types";

export interface DiscoveryFilters {
  requirePhone?: boolean;
  requireWebsite?: boolean;
  keyword?: string;
  minRating?: number;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Indian states/UTs — discovery rotates through these so leads span all India. */
export const INDIA_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Jammu and Kashmir", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Tripura", "Sikkim", "Arunachal Pradesh",
];

/** Bounding boxes (south,west,north,east) for the states Nominatim reliably geocodes. */
const STATE_BBOX: Record<string, string> = {
  "Andhra Pradesh": "12.5,76.7,19.9,84.8",
  Assam: "21.9,89.7,27.8,97.4",
  Bihar: "24.0,83.3,27.5,88.3",
  Chhattisgarh: "17.7,80.3,23.9,84.4",
  Delhi: "28.4,76.8,28.9,77.3",
  Goa: "14.9,73.7,15.9,74.3",
  Gujarat: "20.0,68.1,24.7,74.5",
  Haryana: "27.6,74.4,30.9,77.6",
  "Himachal Pradesh": "30.0,75.6,33.2,79.1",
  Jharkhand: "22.0,83.3,25.3,88.0",
  Karnataka: "11.6,74.0,18.5,78.6",
  Kerala: "8.0,74.8,12.8,77.6",
  "Madhya Pradesh": "21.1,74.0,26.9,82.8",
  Maharashtra: "15.6,72.6,22.0,80.9",
  Odisha: "17.8,81.3,22.6,87.5",
  Punjab: "29.5,73.8,32.6,76.9",
  Rajasthan: "23.0,69.3,30.2,78.3",
  "Tamil Nadu": "8.0,76.2,13.6,80.4",
  Telangana: "15.8,77.2,19.9,81.0",
  "Uttar Pradesh": "23.6,77.0,30.4,84.2",
  Uttarakhand: "28.6,77.5,31.5,81.1",
  "West Bengal": "21.5,85.8,27.2,89.9",
  "Jammu and Kashmir": "32.3,73.5,35.7,80.3",
  Manipur: "23.8,93.0,25.7,94.8",
  Meghalaya: "24.9,89.8,26.2,92.8",
  Mizoram: "21.9,92.0,24.5,93.5",
  Nagaland: "25.1,93.4,27.1,95.2",
  Tripura: "22.9,91.1,24.5,92.4",
  Sikkim: "27.0,87.9,28.5,89.0",
  "Arunachal Pradesh": "26.6,91.5,29.5,97.4",
};

/** Overpass query filtered to the given bbox, all-India friendly. */
function overpassQuery(category: string, bbox: string): string {
  const tags = CATEGORY_CONFIG.find((c) => c.value === category)?.overpassTags ?? ["amenity=school"];
  const clauses = tags
    .map((t) => {
      const [k, v] = t.split("=");
      return `node["${k}"="${v}"](${bbox}); way["${k}"="${v}"](${bbox}); relation["${k}"="${v}"](${bbox});`;
    })
    .join("\n  ");
  return `[out:json][timeout:90][maxsize:1073741824];(\n  ${clauses}\n);out center tags 3000;`;
}

/** Neighbouring-country ISO codes we never want in an all-India sweep. */
const FOREIGN_COUNTRY = /^(BD|PK|NP|BT|LK|MM|CN|AF|IR|ID|TH|MY|SG|AE|SA|OM|QA|KW|BH|TL)$/i;

/** 3x3 tile labels for a state bbox sweep (row-major, north-first). */
const TILE_LABELS = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"];
let tileCursor = 0;

/** Split a "south,west,north,east" bbox into the given 0..8 tile. */
function tileBbox(bbox: string, tile: number): string {
  const [s, w, n, e] = bbox.split(",").map(Number);
  if ([s, w, n, e].some((v) => Number.isNaN(v))) return bbox;
  const row = Math.floor(tile / 3);
  const col = tile % 3;
  const dLat = (n - s) / 3;
  const dLon = (e - w) / 3;
  const subS = (s + dLat * row).toFixed(4);
  const subN = (s + dLat * (row + 1)).toFixed(4);
  const subW = (w + dLon * col).toFixed(4);
  const subE = (w + dLon * (col + 1)).toFixed(4);
  return `${subS},${subW},${subN},${subE}`;
}

/**
 * Discovery agent — all-India lead hunting.
 * Rotates through states (national coverage, no single city limit). Uses real
 * OpenStreetMap data; MOCK_MODE falls back to generated leads.
 */
export async function runDiscovery(params: {
  state?: string;
  category: InstitutionCategory | string;
  limit: number;
  filters?: DiscoveryFilters;
}): Promise<number | null> {
  const filters: DiscoveryFilters = params.filters ?? {};
  const state =
    params.state || config.autoStates[0] || INDIA_STATES[Math.floor(Math.random() * INDIA_STATES.length)];
  const fullBbox = STATE_BBOX[state] ?? "6.5,68.0,35.5,97.5";
  // Public Overpass instances time out on whole-state queries. Sweep one ninth
  // of the state bbox per mission; rotating tiles still covers the whole state.
  const tile = tileCursor++ % 9;
  const bbox = tileBbox(fullBbox, tile);
  const tileLabel = TILE_LABELS[tile];

  const mission = createMission(`All India · ${state} (${tileLabel})`, params.category, params.limit, { state, tile: tileLabel, ...filters });

  await runAgentTask({
    agentId: "lead_finder",
    missionId: mission.id,
    taskLabel: `Discovering ${params.category}s in ${state} (All India)`,
    fn: async (ctx) => {
      pushOfficeEvent("mission", `Discovery mission: ${params.category}s · ${state}`, {
        agentId: "lead_finder",
        icon: "🔔",
      });
      logAgent("lead_finder", `National sweep targeting ${state} (bbox ${bbox})`, { missionId: mission.id });

      ctx.progress(15, "Querying the OpenStreetMap floor");
      const query = overpassQuery(params.category, bbox);
      const raw = await fetchOverpass(query);

      ctx.progress(30, `Raw: ${raw.length} ${params.category} entries`);

      // De-dup + filter.
      const seen = new Set<string>();
      const rows: OverpassElement[] = [];
      let dup = 0;
      for (const el of raw) {
        const t = el.tags ?? {};
        const name = t.name?.trim();
        if (!name) continue;
        const country = t["addr:country"];
        if (country && FOREIGN_COUNTRY.test(country)) continue;
        if (isForeignLead(el.lat, el.lon, name)) continue;
        if (filters.requirePhone && !(t.phone || t["contact:phone"])) continue;
        if (filters.requireWebsite && !(t.website || t["contact:website"])) continue;
        if (filters.keyword && !name.toLowerCase().includes(filters.keyword.toLowerCase())) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) {
          dup++;
          continue;
        }
        seen.add(key);
        rows.push(el);
        if (rows.length >= params.limit * 2) break;
      }

      ctx.progress(45, `Filtered to ${rows.length} unique (${dup} duplicates skipped)`);

      const picked = rows.slice(0, params.limit).sort(scoreSort);
      let saved = 0;
      for (const el of picked) {
        const t = el.tags ?? {};
        const name = (t["name:en"] || t.int_name || t.name)?.trim();
        if (!name) continue;
        if (institutionExists(name, state)) continue; // dedupe against DB too
        createInstitution({
          mission_id: mission.id,
          name,
          category: params.category,
          region: "All India",
          state,
          lat: el.center?.lat ?? el.lat ?? null,
          lon: el.center?.lon ?? el.lon ?? null,
          address: [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(", ") || null,
          city: t["addr:city"] || t["addr:town"] || t["addr:suburb"] || null,
          website: normalizeWebsite(t.website || t["contact:website"]),
          phone: t.phone || t["contact:phone"] || t["phone:mobile"] || null,
          whatsapp_available: t.phone || t["contact:phone"] ? 1 : 0,
          email: t.email || t["contact:email"] || t["website:email"] || null,
          maps_link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${state}`)}`,
          rating: t.rating ? parseFloat(t.rating) : null,
          reviews: t.reviews ? parseInt(t.reviews, 10) : null,
          stage: "discovery",
          folder_status: "in_progress",
          last_agent: "lead_finder",
        });
        saved++;
        ctx.progress(45 + Math.round(((saved) / picked.length) * 50), `🔔 New lead found: ${name} (${saved}/${picked.length})`);
        pushOfficeEvent("lead", `🔔 New lead found: ${name}`, { agentId: "lead_finder", icon: "🔔", data: { name } });
        if (!config.mockMode) await delay(120);
      }

      pushOfficeEvent("done", `${saved} new ${params.category} leads in ${state}`, {
        agentId: "lead_finder",
        icon: "🗺️",
      });
      ctx.progress(100, `Done. ${saved}/${picked.length} saved.`);
    },
  });

  return mission.id;
}

function scoreSort(a: OverpassElement, b: OverpassElement): number {
  const sc = (e: OverpassElement) => {
    const t = e.tags ?? {};
    return (t.phone || t["contact:phone"] ? 4 : 0) + (t.website || t["contact:website"] ? 2 : 0) + (t["contact:email"] || t.email ? 1 : 0);
  };
  return sc(b) - sc(a);
}

function normalizeWebsite(site: string | undefined): string | null {
  if (!site) return null;
  const s = site.trim();
  if (!s) return null;
  return s.startsWith("http") ? s : `https://${s}`;
}

async function fetchOverpass(query: string): Promise<OverpassElement[]> {
  const endpoints = [
    config.overpassUrl,
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  let lastErr: unknown = null;
  for (const ep of endpoints) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000);
    try {
      const res = await fetch(`${ep}?data=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "wreckerai/1.0 (lead-finder)", Accept: "application/json" },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} from ${new URL(ep).host}`);
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const els = json.elements ?? [];
      // Some mirrors silently report an empty dataset for regions they don't
      // cover — treat "empty" as a failed endpoint and try the next one.
      if (els.length) return els;
      lastErr = new Error(`Overpass returned no data from ${new URL(ep).host}`);
    } catch (err) {
      lastErr = err;
      await delay(1200);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Overpass unreachable: ${String((lastErr as Error)?.message ?? lastErr)}`);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}