// Server-only: the shared "find real places with Gemini" logic behind
// /api/places (a whole city on the fly) and /api/hunt (beyond what's shown).

import { FAST_MODELS, callGemini, parseJsonLoose } from "./gemini";
import type { Category, Photo, Place, Stay } from "./types";

export const CATEGORIES: Category[] = ["eat", "music", "explore", "family", "history"];
const TIMES = ["morning", "afternoon", "sunset", "dinner", "evening", "anytime"];
const MOODS = ["romantic", "music", "casual", "unusual", "special", "family", "outdoors", "rainy"];

type Found = {
  name: string;
  category: string;
  tagline: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  depth: number;
  pricePerPerson: number;
  priceLabel: string;
  bestTime: string;
  durationMin: number;
  indoor: boolean;
  kidFit: number;
  tags: string[];
  moods: string[];
  whyFound: string;
  insiderTip: string;
  localsSay: string;
  hours: string;
  rainPlan: string;
  booking: string;
  hype: number;
  hypeText: string;
  officialUrl: string;
};

const FIELDS = `name, category (one of ${CATEGORIES.join("|")}), tagline (max 12 words, evocative), neighborhood, address (full street address),
lat, lng (accurate coordinates), depth (1 = famous classic, 2 = local favorite, 3 = deep cut most visitors miss),
pricePerPerson (number in US dollars, 0 if free), priceLabel ("Free","$","$$","$$$"),
bestTime (one of ${TIMES.join("|")}), durationMin, indoor (boolean), kidFit (1 skip with kids, 2 doable, 3 great),
tags (3-6 lowercase words, e.g. local, patio, views, cheap-eats, fancy, photogenic, sunset, drinks, walk, beach),
moods (0-3 of ${MOODS.join("|")}),
whyFound (2 sentences, friend voice, why locals love it and why it fits them),
insiderTip (1 sentence), localsSay (1-2 sentences summarizing what locals say, paraphrased, cite no usernames),
hours (typical hours as found, say "check" if unsure), rainPlan (1 sentence), booking (cheapest legit way to book or "No booking needed"),
hype (1-5), hypeText (1 honest sentence), officialUrl (official website or "")`;

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};
// URL-safe id from a name; names with no Latin letters (e.g. 京都) get a short hash instead
export const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
  (s ? `x${Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)}` : "");
export const milesApart = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

// Real road minutes from each source to each destination (one OSRM call), plus 2 minutes to park.
export async function roadMinutes(from: { lat: number; lng: number }[], to: { lat: number; lng: number }[]): Promise<(number | null)[][]> {
  const empty = () => from.map(() => to.map(() => null));
  if (!from.length || !to.length) return empty();
  const coords = [...from, ...to].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const sources = from.map((_, i) => i).join(";");
  const destinations = to.map((_, i) => i + from.length).join(";");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?sources=${sources}&destinations=${destinations}&annotations=duration`,
      { headers: { "User-Agent": "Uncover/0.4 (travel app prototype)" }, signal: ctrl.signal },
    );
    const data = await res.json();
    if (!data.durations) return empty();
    return (data.durations as (number | null)[][]).map((row) => row.map((s) => (s == null ? null : Math.max(3, Math.round(s / 60) + 2))));
  } catch {
    return empty();
  } finally {
    clearTimeout(timer);
  }
}

const STOP = new Set(["the", "and", "of", "restaurant", "bar", "grill", "cafe", "park", "house", "co", "company", "shop"]);
// Wikimedia asks for a User-Agent that says how to reach the app, and throttles anonymous-looking ones hard
const UA = { "User-Agent": "Uncover/0.5 (https://clod-orpin.vercel.app; travel planner prototype)" };

// Significant, accent-free words of a name: "Basilica of Saint Lawrence" → basilica, saint, lawrence
const nameWords = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bst\b\.?/g, "saint")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !["the", "and", "of", "at", "de", "la", "le", "el"].includes(w));

// Share of the place's words that appear in the other name ("Western N.C. Nature Center" ≈ 0.6)
function nameMatch(place: string, other: string): number {
  const a = nameWords(place);
  const b = new Set(nameWords(other));
  if (!a.length) return 0;
  return a.filter((w) => b.has(w)).length / a.length;
}

async function getJson(url: string, ms = 5000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Runs fn over items, at most `limit` at a time (polite to the free map and photo services)
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

type LatLng = { lat: number; lng: number };

// Checks Gemini's pin against OpenStreetMap (Photon search): the same-named place near the destination wins.
const OSM_TYPES: Record<string, string> = { N: "node", W: "way", R: "relation" };

async function osmPin(name: string, city: string, near: LatLng, center: LatLng, radius: number): Promise<(LatLng & { ref?: string }) | null> {
  const q = encodeURIComponent(`${name} ${city.split(",")[0]}`);
  const data = await getJson(`https://photon.komoot.io/api/?q=${q}&lat=${near.lat}&lon=${near.lng}&limit=4&lang=en`);
  for (const f of data?.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || ["place", "boundary", "highway"].includes(p.osm_key)) continue;
    if (nameMatch(name, String(p.name ?? "")) >= 0.5 && milesApart(center, { lat, lng }) < radius) {
      const type = OSM_TYPES[p.osm_type];
      return { lat, lng, ref: type && p.osm_id ? `${type}/${p.osm_id}` : undefined };
    }
  }
  return null;
}

export type OsmFacts = { hours?: string; website?: string; checked?: string; closed: boolean };

// One Overpass request for a whole city (the free public server turns away parallel bursts, so this
// runs once after all categories arrive, via /api/osm-facts): opening hours, website, last survey
// date, and whether OpenStreetMap mappers have marked the place closed ("disused:", "was:", …).
export async function osmFacts(refs: string[]): Promise<Record<string, OsmFacts>> {
  const out: Record<string, OsmFacts> = {};
  if (!refs.length) return out;
  const ids = (type: string) => refs.filter((r) => r.startsWith(`${type}/`)).map((r) => r.split("/")[1]);
  const parts = ["node", "way", "relation"].filter((t) => ids(t).length).map((t) => `${t}(id:${ids(t).join(",")});`);
  const query = `[out:json][timeout:10];(${parts.join("")});out tags;`;
  let data = null;
  for (let attempt = 0; attempt < 2 && !data?.elements; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000)); // busy: one polite retry
    data = await getJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, 12_000);
  }
  if (!data?.elements) throw new Error("overpass-unavailable");
  for (const el of data.elements as { type: string; id: number; tags?: Record<string, string> }[]) {
    const t = el.tags ?? {};
    const keys = Object.keys(t);
    out[`${el.type}/${el.id}`] = {
      hours: t.opening_hours,
      website: t.website || t["contact:website"] || t.url,
      checked: t["check_date:opening_hours"] || t.check_date || t.survey_date || t["survey:date"],
      closed:
        /^(closed|off)$/i.test(t.opening_hours ?? "") ||
        keys.some((k) => /^(disused|abandoned|was|closed|demolished|removed):/.test(k)) ||
        t.disused === "yes",
    };
  }
  return out;
}

type CommonsInfo = {
  thumburl?: string;
  url: string;
  width: number;
  height: number;
  mime: string;
  descriptionurl: string;
  extmetadata?: Record<string, { value: string }>;
};

function toPhoto(info: CommonsInfo): Photo {
  const artist = (info.extmetadata?.Artist?.value ?? "Unknown")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .slice(0, 60);
  return {
    src: info.thumburl || info.url,
    credit: artist,
    license: info.extmetadata?.LicenseShortName?.value ?? "See source",
    source: info.descriptionurl,
  };
}

type WikiPage = { title: string; pageimage?: string; coordinates?: { lat: number; lon: number }[] };

// Lead photos of the places' own Wikipedia articles, in two requests for the whole batch: look up
// each name (and "Name (City)", "Name, City") as an exact article title, then fetch the photos'
// license info from Commons. An article only counts when its coordinates put it within a mile of
// the place, so "Tupelo Honey" the song never stands in for Tupelo Honey the restaurant.
// (Up to 50 titles per request: ~16 places, more than one category ever has.)
async function wikipediaPhotos(places: Place[], city: string): Promise<Map<Place, Photo>> {
  const found = new Map<Place, Photo>();
  const town = city.split(",")[0].trim();
  const variants = (p: Place) => {
    const base = p.name.replace(/\s*\(.*?\)/g, "").trim(); // "Museum of Science (AMOS)" → "Museum of Science"
    return [base, `${base} (${town})`, `${base}, ${town}`];
  };
  const titles = [...new Set(places.flatMap(variants))].slice(0, 50);
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(titles.join("|"))}` +
      `&prop=pageimages|coordinates&piprop=name&pilicense=free&colimit=max`,
    6000,
  );
  if (!data?.query) return found;
  // Follow normalizations and redirects back to the title we asked for
  const resolve = new Map<string, string>();
  for (const r of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) resolve.set(r.from, r.to);
  const final = (t: string) => {
    for (let i = 0; i < 3 && resolve.has(t); i++) t = resolve.get(t)!;
    return t;
  };
  const byTitle = new Map<string, WikiPage>((Object.values(data.query.pages ?? {}) as WikiPage[]).map((pg) => [pg.title, pg]));

  const picks = new Map<Place, string>();
  for (const p of places) {
    for (const t of variants(p)) {
      const pg = byTitle.get(final(t));
      const c = pg?.coordinates?.[0];
      // 1.5 miles: big estates and parks are pinned at different spots by OSM and Wikipedia
      if (pg?.pageimage && c && milesApart(p.location, { lat: c.lat, lng: c.lon }) < 1.5) {
        picks.set(p, pg.pageimage);
        break;
      }
    }
  }
  if (!picks.size) return found;

  const files = [...new Set(picks.values())];
  const img = await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(files.map((f) => `File:${f}`).join("|"))}` +
      `&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280`,
    6000,
  );
  const infoByFile = new Map<string, CommonsInfo>();
  const norm = (f: string) => f.replace(/^File:/, "").replace(/_/g, " ");
  for (const pg of Object.values(img?.query?.pages ?? {}) as { title: string; imageinfo?: CommonsInfo[] }[]) {
    const info = pg.imageinfo?.[0];
    if (info && ["image/jpeg", "image/png"].includes(info.mime) && info.width >= 640) infoByFile.set(norm(pg.title), info);
  }
  for (const [p, file] of picks) {
    const info = infoByFile.get(norm(file));
    if (info) found.set(p, toPhoto(info));
  }
  return found;
}

// Makes each place trustworthy before it's shown: pin checked against OpenStreetMap,
// then the best licensed photo we can verify (its Wikipedia article's, else a matching Commons file).
async function verifyPlaces(places: Place[], city: string, center: LatLng, radius: number) {
  await pool(places, 4, async (p) => {
    const osm = await osmPin(p.name, city, p.location, center, radius);
    if (!osm) return;
    p.location = { ...p.location, lat: osm.lat, lng: osm.lng, pin: "osm" };
    // Hours and website are filled in later, for the whole city at once (see osmFacts)
    if (osm.ref) p.realityCheck.osm = { url: `https://www.openstreetmap.org/${osm.ref}` };
  });
  const wiki = await wikipediaPhotos(places, city);
  for (const [p, photo] of wiki) p.photos = [photo];
  // Commons search is one request per place, so go gently
  await pool(places.filter((p) => !p.photos.length), 2, async (p) => {
    const photo = await commonsPhoto(p.name, city);
    if (photo) p.photos = [photo];
  });
}

// Words that describe a photo of a place rather than some other subject
const PHOTO_WORDS = new Set(
  ("file jpg jpeg png view views from at in of on the and with to exterior interior inside outside entrance front facade facades " +
    "building buildings panorama panoramic night day evening morning sunset aerial main side street seen photo image old new " +
    "north south east west detail general").split(" "),
);

// Rejects files that mention the place but are about something else there:
// "Robert's geranium red leaf, Jardim Botânico" or "Regata sul Canal Grande – Guardi – Gulbenkian Museum".
function aboutThePlace(fileTitle: string, name: string, city: string): boolean {
  const words = nameWords(fileTitle);
  // Signs, maps, and closure notices say the wrong thing about a place ("…announce closure of … park")
  if (words.some((w) => ["sign", "signs", "signboard", "closure", "closed", "map", "plaque", "logo", "menu", "notice"].includes(w))) return false;
  const known = new Set([...nameWords(name), ...nameWords(city)]);
  const extra = words.filter((w) => !known.has(w) && !PHOTO_WORDS.has(w) && !/\d/.test(w));
  return extra.length <= 3;
}

// A freely licensed photo from Wikimedia Commons whose file name actually mentions the place.
export async function commonsPhoto(name: string, city: string): Promise<Photo | null> {
  const cityWords = new Set(city.toLowerCase().split(/[^a-z0-9]+/));
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !cityWords.has(w));
  // A photo search for just the city name (the hero) keys on the city itself
  const must = words.length ? words : [...cityWords].filter((w) => w.length > 2).slice(0, 1);
  if (!must.length) return null;
  const q = encodeURIComponent(words.length ? `${name} ${city.split(",")[0]}` : name);
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${q}` +
    `&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = Object.values(data.query?.pages ?? {}) as {
      title: string;
      index: number;
      imageinfo?: { thumburl?: string; url: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[];
    }[];
    const match = pages
      .sort((a, b) => a.index - b.index)
      .find((pg) => {
        const info = pg.imageinfo?.[0];
        const title = pg.title.toLowerCase();
        // The file name must mention the place, so we don't show a random building. Landscape only.
        return (
          info &&
          ["image/jpeg", "image/png"].includes(info.mime) &&
          info.width >= 900 &&
          info.width >= info.height &&
          must.every((w) => title.includes(w)) &&
          aboutThePlace(pg.title, name, city)
        );
      });
    const info = match?.imageinfo?.[0];
    return info ? toPhoto(info) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type FindOptions = {
  city: string; // "Lisbon, Portugal"
  center: { lat: number; lng: number }; // anything further than `radiusMiles` from here is dropped
  radiusMiles?: number;
  stays: Stay[]; // road times are looked up from each of these
  ask: string; // what to find, e.g. "6 places in the eat category, ..."
  context?: string; // extra lines for the prompt (party, limits, likes)
  exclude?: string[];
  count: number;
  idPrefix: string;
  origin: "city" | "hunt";
  categories?: Category[]; // only these are allowed; anything else becomes the first
  kids?: boolean;
};

// Once the key is refused Google Search (free plans), skip trying it for a while:
// each refused attempt still costs a request against the per-minute quota.
let searchOffUntil = 0;

// Asks Gemini for real places (live Google Search when the key allows it, else its own knowledge),
// cleans them into Place objects, then adds licensed photos and real road times.
export async function findPlaces(o: FindOptions): Promise<{ places: Place[]; mode: "search" | "knowledge"; model: string }> {
  const system = [
    "You are Uncover: an obsessive traveler who interviewed locals. Find REAL, currently operating places.",
    "Prefer what locals recommend (local subreddits, local newspapers and city magazines, neighborhood blogs, event calendars) over tourist listicles and review aggregators.",
    "Famous places are fine only if locals genuinely vouch for them. Never invent a place. Skip anything that appears permanently closed.",
    "Be honest: include real caveats (limited hours, crowds, not great for kids).",
    "Respond with ONLY a JSON array, no prose.",
  ].join(" ");

  const prompt = `Destination: ${o.city} (center lat ${o.center.lat.toFixed(4)}, lng ${o.center.lng.toFixed(4)})
${o.context ?? ""}
Already known (do NOT repeat): ${(o.exclude ?? []).slice(0, 80).join("; ") || "nothing yet"}

Find ${o.ask}
Return a JSON array of objects with exactly these keys:
${FIELDS}.`;

  // Leave time for pins, photos, and road times (≤10s + ≤6s) inside the host's 60-second limit
  const deadline = Date.now() + 40_000;
  const models = o.origin === "city" ? FAST_MODELS : undefined;
  let mode: "search" | "knowledge" = "search";
  let out;
  let raw: Found[] | null = null;
  try {
    if (Date.now() < searchOffUntil) throw new Error("search-off 429");
    out = await callGemini({ system: `${system} Use Google Search.`, prompt, search: true, temperature: 0.5, timeoutMs: 30_000, models, deadline });
  } catch (e) {
    // The key's plan may not include search (quota 429/403), or it was too slow.
    // Fall back to Gemini's own knowledge, and say so on every card.
    if (/no-key/.test(String(e))) throw e;
    if (/429|403|400/.test(String(e)) && !String(e).includes("search-off")) searchOffUntil = Date.now() + 3600_000;
    mode = "knowledge";
  }
  // Knowledge mode: the lite model occasionally writes broken JSON, so ask again once while there's time
  for (let attempt = 0; ; attempt++) {
    if (!out) {
      out = await callGemini({
        system: `${system} You cannot browse right now: only include places you are highly confident exist and were operating recently.`,
        prompt,
        // Plain JSON, not a response schema: with a schema the lite model takes ~3x longer on a list this size
        json: true,
        temperature: attempt ? 0.2 : 0.4,
        timeoutMs: 45_000,
        models,
        deadline,
      });
    }
    try {
      raw = parseJsonLoose<Found[]>(out.text);
      break;
    } catch (e) {
      console.error("Gemini returned unreadable JSON:", out.text.slice(0, 200));
      if (attempt >= 1 || deadline - Date.now() < 15_000) throw e;
      mode = "knowledge";
      out = undefined;
    }
  }
  // Fuzzy de-dupe: "Waterfront Park" matches "Waterfront Park & Pineapple Fountain"
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const known = (o.exclude ?? []).map(norm);
  const excluded = (n: string) => known.some((k) => k === norm(n) || k.startsWith(norm(n)) || norm(n).startsWith(k));
  const today = new Date().toISOString().slice(0, 10);
  const radius = o.radiusMiles ?? 90;
  const seen = new Set<string>();

  let places: Place[] = (Array.isArray(raw) ? raw : [])
    .filter((f) => f && f.name && !excluded(String(f.name)))
    .map((f) => ({ f, lat: Number(f.lat), lng: Number(f.lng) }))
    // Coordinates must be plausible: near the destination
    .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && milesApart(o.center, { lat, lng }) < radius)
    .filter(({ f }) => {
      const id = slug(String(f.name));
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, o.count + 1)
    .map(({ f, lat, lng }) => {
      const price = clamp(f.pricePerPerson, 0, 1000, 20);
      const allowed = o.categories?.length ? o.categories : CATEGORIES;
      const category = allowed.includes(f.category as Category) ? (f.category as Category) : allowed[0];
      return {
        id: `${o.idPrefix}-${slug(String(f.name))}`,
        name: String(f.name).slice(0, 80),
        category,
        tagline: String(f.tagline ?? "").slice(0, 120),
        neighborhood: String(f.neighborhood || o.city.split(",")[0]).slice(0, 60),
        depth: clamp(Math.round(Number(f.depth)), 1, 3, o.origin === "hunt" ? 3 : 2) as 1 | 2 | 3,
        tags: (Array.isArray(f.tags) ? f.tags : []).map((t) => String(t).toLowerCase().replace(/\s+/g, "-")).slice(0, 6),
        moods: (Array.isArray(f.moods) ? f.moods : []).map((m) => String(m).toLowerCase()).filter((m) => MOODS.includes(m)).slice(0, 3),
        location: { address: String(f.address ?? "").slice(0, 160), lat, lng },
        price: { perPerson: price, label: price === 0 ? "Free" : String(f.priceLabel || "$$").slice(0, 4) },
        bestTime: (TIMES.includes(f.bestTime) ? f.bestTime : "anytime") as Place["bestTime"],
        durationMin: clamp(f.durationMin, 15, 360, 60),
        indoor: Boolean(f.indoor),
        photos: [],
        whyFound: String(f.whyFound ?? "").slice(0, 400),
        insiderTip: String(f.insiderTip ?? "").slice(0, 240),
        localsSay: { text: String(f.localsSay ?? "").slice(0, 300), sourced: out.sources.length > 0 },
        realityCheck: {
          hours: String(f.hours ?? "Check before you go").slice(0, 120),
          warnings: [
            mode === "search"
              ? "Found by live search. Double-check hours on the official site before you go."
              : "Suggested from Gemini's knowledge, not a live search. Confirm it's open before you go.",
          ],
          officialUrl: /^https?:\/\//.test(String(f.officialUrl)) ? String(f.officialUrl) : "",
          lastChecked: null,
        },
        rainPlan: { text: String(f.rainPlan ?? "").slice(0, 200) },
        booking: { best: String(f.booking ?? "").slice(0, 200), tips: [], lastChecked: null },
        hypeCheck: { score: clamp(f.hype, 1, 5, 3), text: String(f.hypeText ?? "").slice(0, 200) },
        kidFit: { score: clamp(f.kidFit, 1, 3, 2) as 1 | 2 | 3, stroller: true, notes: "" },
        live: { foundAt: today, mode, origin: o.origin, sources: out.sources.slice(0, 8) },
      } satisfies Place;
    });

  // Nothing usable: fail (so an empty answer isn't cached for a day) and let the app retry
  if (o.origin === "city" && !places.length) throw new Error("no-places");

  // Families: drop anything the AI itself rated "skip with kids"
  if (o.kids) places = places.filter((p) => p.kidFit.score >= 2);
  places = places.slice(0, o.count);

  // Lighter models tend to call everything a "local favorite". The prompt asks for classics first
  // and deep cuts last, so when depths don't vary, spread them by position within each category.
  if (o.origin === "city" && new Set(places.map((p) => p.depth)).size === 1) {
    for (const cat of new Set(places.map((p) => p.category))) {
      const group = places.filter((p) => p.category === cat);
      group.forEach((p, i) => (p.depth = (1 + Math.floor((i * 3) / group.length)) as 1 | 2 | 3));
    }
  }

  // Checked pins and licensed photos first, then real road times from every stay (one routing call)
  // Capped by whatever time Gemini left (at least 10s), keeping 6s for road times inside the 60s limit.
  // Anything not checked by then keeps Gemini's pin and the painted placeholder.
  // (deadline is start + 40s, so this ends by start + 52s)
  const budget = Math.max(10_000, deadline + 12_000 - Date.now());
  await Promise.race([verifyPlaces(places, o.city, o.center, radius), new Promise((r) => setTimeout(r, budget))]);
  const times = await roadMinutes(o.stays, places.map((p) => p.location));
  places.forEach((p, i) => {
    const from: Record<string, number> = {};
    o.stays.forEach((s, si) => {
      const t = times[si]?.[i];
      if (t != null) from[s.id] = t;
    });
    if (Object.keys(from).length) p.driveFrom = from;
  });

  return { places, mode, model: out.model };
}
