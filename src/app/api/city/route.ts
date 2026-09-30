import { NextResponse } from "next/server";
import { commonsPhoto, milesApart, slug } from "@/lib/finder";
import { cached, callGemini, geminiKey, parseJsonLoose, rateLimited } from "@/lib/gemini";
import type { City, Stay } from "@/lib/types";

// "Where are we going?" → any city, town, or region on Earth.
// OpenStreetMap pins down where it actually is; Gemini writes the local know-how
// (neighborhoods to stay in, getting around). Places arrive separately from /api/places.
export const maxDuration = 60;

type Geo = {
  lat: string;
  lon: string;
  name: string;
  display_name: string;
  boundingbox: [string, string, string, string];
  address?: Record<string, string>;
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "The common English name of the destination" },
    tagline: { type: "STRING", description: "Max 9 words, evocative, specific to this place (not generic travel copy)" },
    subreddit: { type: "STRING", description: "The main local subreddit name without r/, or empty string if unsure" },
    sunset: { type: "STRING", description: "Typical local sunset time this month, 24h HH:MM" },
    stays: {
      type: "ARRAY",
      description: "4-6 neighborhoods or areas visitors typically stay in",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          area: { type: "STRING", description: "Max 6 words: landmarks or feel, e.g. 'Old town & the waterfront'" },
          lat: { type: "NUMBER" },
          lng: { type: "NUMBER" },
        },
        required: ["name", "area", "lat", "lng"],
      },
    },
    gettingAround: { type: "ARRAY", items: { type: "STRING" }, description: "3-4 practical, specific tips a local would give a visitor about getting around" },
  },
  required: ["name", "tagline", "stays", "gettingAround", "sunset"],
};

async function geocode(query: string): Promise<Geo | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1&addressdetails=1&accept-language=en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  // Throws when OpenStreetMap is unreachable (so that isn't cached as "no such place")
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Uncover/0.4 (travel app prototype)" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`geocode-failed ${res.status}`);
    const data = (await res.json()) as Geo[];
    return data[0] ?? null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildCity(query: string): Promise<City | { error: string; status: number }> {
  const geo = await geocode(query);
  if (!geo) return { error: "not-found", status: 404 };

  const lat = Number(geo.lat);
  const lng = Number(geo.lon);
  const a = geo.address ?? {};
  const country = a.country ?? "";
  // US/Canada/Australia: "SC", "BC". Elsewhere: the country.
  const iso = a["ISO3166-2-lvl4"]?.split("-")[1];
  const region = ["us", "ca", "au"].includes(a.country_code ?? "") && iso ? iso : country;
  const osmName = geo.name || a.city || a.town || a.village || query;

  // How far places may be from the center: bigger for big cities and regions
  const [s, n, w, e] = geo.boundingbox.map(Number);
  const span = milesApart({ lat: s, lng: w }, { lat: n, lng: e });
  const radius = Math.round(Math.min(120, Math.max(30, span / 2 + 25)));

  const month = new Date().toLocaleString("en-US", { month: "long" });
  const [out, hero] = await Promise.all([
    callGemini({
      system:
        "You are Uncover, a travel-obsessed local friend. Give accurate, specific local knowledge. Never invent neighborhoods. Coordinates must be accurate.",
      prompt: `Destination: ${geo.display_name} (lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}). Current month: ${month}.
Describe it for a visitor: its name, a tagline, the local subreddit, the typical sunset time this month, the areas visitors stay in, and how to get around.`,
      schema: SCHEMA,
      temperature: 0.3,
    }),
    commonsPhoto(osmName, osmName),
  ]);
  const g = parseJsonLoose<{ name: string; tagline: string; subreddit?: string; sunset: string; stays: Omit<Stay, "id">[]; gettingAround: string[] }>(out.text);

  const ids = new Set<string>();
  const stays: Stay[] = (g.stays ?? [])
    .filter((st) => st?.name && Number.isFinite(st.lat) && Number.isFinite(st.lng) && milesApart({ lat, lng }, st) < radius)
    .map((st) => ({ id: slug(st.name) || "area", name: String(st.name).slice(0, 40), area: String(st.area ?? "").slice(0, 60), lat: st.lat, lng: st.lng }))
    .filter((st) => !ids.has(st.id) && ids.add(st.id))
    .slice(0, 6);
  if (!stays.length) stays.push({ id: "center", name: "Center", area: osmName, lat, lng });

  const name = String(g.name || osmName).slice(0, 40);
  return {
    id: slug(`${name}-${a.country_code ?? ""}`),
    name,
    state: region,
    tagline: String(g.tagline ?? "").slice(0, 80),
    sunset: /^\d{1,2}:\d{2}$/.test(g.sunset ?? "") ? g.sunset.padStart(5, "0") : "18:30",
    subreddit: /^[A-Za-z0-9_]{2,30}$/.test(g.subreddit ?? "") ? g.subreddit : undefined,
    hero: hero ? { ...hero, caption: name } : null,
    stays,
    gettingAround: (g.gettingAround ?? []).map((t) => String(t).slice(0, 220)).slice(0, 4),
    places: [],
    generated: {
      query,
      country,
      lat,
      lng,
      radius,
      createdAt: new Date().toISOString().slice(0, 10),
      pending: ["eat", "explore", "history", "family", "music"],
      failed: [],
    },
  };
}

export async function POST(req: Request) {
  if (!geminiKey()) return NextResponse.json({ error: "no-key" }, { status: 503 });
  if (rateLimited(req, 6, 60_000, "city")) return NextResponse.json({ error: "slow-down" }, { status: 429 });

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const query = String(body.query ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (query.length < 2) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  try {
    const result = await cached(`city:${query.toLowerCase()}`, 24 * 3600_000, () => buildCity(query));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ city: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
