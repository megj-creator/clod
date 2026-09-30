import { NextResponse } from "next/server";
import { CATEGORIES, findPlaces, milesApart, slug } from "@/lib/finder";
import { cached, geminiKey, rateLimited } from "@/lib/gemini";
import type { Category, Stay } from "@/lib/types";

// Fills a searched city with real places, one category per call, so the app can
// show the first ones while the rest are still being found.
export const maxDuration = 60;

const MIX =
  "For each category: list famous classics locals still vouch for first (depth 1), then local favorites (depth 2), then deep cuts most visitors miss (depth 3), roughly a third each. Spread across neighborhoods and price levels.";

const ASK: Record<Category, [number, string]> = {
  eat: [7, "places to eat and drink: restaurants, cafes, bakeries, food markets, bars. Include breakfast, lunch, and dinner options and at least one cheap local staple"],
  explore: [7, "places to explore: parks, viewpoints, walkable neighborhoods, beaches or waterfronts, gardens, markets, nature within reach"],
  history: [5, "places for history and culture: museums, historic sites, architecture, landmarks, cemeteries, cultural centers"],
  family: [5, "places genuinely great with kids and families (kidFit 3): playgrounds, aquariums, zoos, hands-on museums, farms, easy nature"],
  music: [5, "places for live music, nightlife, or performance: venues, jazz or folk bars, music halls, theaters. If there's little live music, the best evening spots instead"],
};

export async function POST(req: Request) {
  if (!geminiKey()) return NextResponse.json({ error: "no-key" }, { status: 503 });
  if (rateLimited(req, 15, 60_000, "places")) return NextResponse.json({ error: "slow-down" }, { status: 429 });

  let body: {
    city?: { id?: string; name?: string; state?: string; lat?: number; lng?: number; radius?: number };
    stays?: Stay[];
    categories?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const c = body.city ?? {};
  // A few categories per call keeps a whole city to ~2 Gemini requests (free plans allow only a handful per minute)
  const cats = CATEGORIES.filter((k) => (body.categories ?? []).includes(k));
  const center = { lat: Number(c.lat), lng: Number(c.lng) };
  if (!c.name || !cats.length || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const radius = Math.min(120, Math.max(20, Number(c.radius) || 40));
  const cityLabel = [c.name, c.state].filter(Boolean).join(", ").slice(0, 80);
  const stays = (Array.isArray(body.stays) ? body.stays : [])
    .filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lng) && milesApart(center, s) < radius)
    .slice(0, 6)
    .map((s) => ({ id: slug(String(s.id)) || "area", name: String(s.name).slice(0, 40), area: "", lat: s.lat, lng: s.lng }));

  try {
    const result = await cached(`places:${slug(String(c.id ?? cityLabel))}:${cats.join("+")}`, 24 * 3600_000, () =>
      findPlaces({
        city: cityLabel,
        center,
        radiusMiles: radius,
        stays,
        ask: `these places, labeled with their category:\n${cats.map((k) => `- category "${k}": ${ASK[k][0]} ${ASK[k][1]}`).join("\n")}\n${MIX}`,
        count: cats.reduce((n, k) => n + ASK[k][0], 0),
        idPrefix: "g",
        origin: "city",
        categories: cats,
      }),
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
