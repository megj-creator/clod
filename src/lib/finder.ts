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
  const timer = setTimeout(() => ctrl.abort(), 8000);
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
    const res = await fetch(url, { headers: { "User-Agent": "Uncover/0.4 (travel app prototype)" }, signal: ctrl.signal });
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
        return info && ["image/jpeg", "image/png"].includes(info.mime) && info.width >= 900 && info.width >= info.height && must.every((w) => title.includes(w));
      });
    const info = match?.imageinfo?.[0];
    if (!info) return null;
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

  // Leave time for photos and road times inside the host's 60-second limit
  const deadline = Date.now() + 48_000;
  const models = o.origin === "city" ? FAST_MODELS : undefined;
  let mode: "search" | "knowledge" = "search";
  let out;
  try {
    if (Date.now() < searchOffUntil) throw new Error("search-off 429");
    out = await callGemini({ system: `${system} Use Google Search.`, prompt, search: true, temperature: 0.5, timeoutMs: 30_000, models, deadline });
  } catch (e) {
    // The key's plan may not include search (quota 429/403), or it was too slow.
    // Fall back to Gemini's own knowledge, and say so on every card.
    if (/no-key/.test(String(e))) throw e;
    if (/429|403|400/.test(String(e)) && !String(e).includes("search-off")) searchOffUntil = Date.now() + 3600_000;
    mode = "knowledge";
    out = await callGemini({
      system: `${system} You cannot browse right now: only include places you are highly confident exist and were operating recently.`,
      prompt,
      // Plain JSON, not a response schema: with a schema the lite model takes ~3x longer on a list this size
      json: true,
      temperature: 0.4,
      timeoutMs: 45_000,
      models,
      deadline,
    });
  }

  let raw: Found[];
  try {
    raw = parseJsonLoose<Found[]>(out.text);
  } catch (e) {
    console.error("Gemini returned unreadable JSON:", out.text.slice(0, 200));
    throw e;
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

  // Licensed photos (in parallel, best effort) and real road times from every stay (one routing call)
  const [, times] = await Promise.all([
    Promise.all(
      places.map(async (p) => {
        const photo = await commonsPhoto(p.name, o.city);
        if (photo) p.photos = [photo];
      }),
    ),
    roadMinutes(o.stays, places.map((p) => p.location)),
  ]);
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
