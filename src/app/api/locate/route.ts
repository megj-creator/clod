import { NextResponse } from "next/server";
import { milesApart } from "@/lib/finder";
import { rateLimited } from "@/lib/gemini";

// Finds the traveler's hotel or address on OpenStreetMap (Photon search, free), near their destination.
export const maxDuration = 15;

const words = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !["the", "hotel", "at", "de", "da", "do"].includes(w));

// Share of the typed words (minus the city's name) found in the result's name
function coverage(q: string, found: string, town: string) {
  const skip = new Set(words(town));
  const want = words(q).filter((w) => !skip.has(w));
  const have = new Set(words(found));
  return want.length ? want.filter((w) => have.has(w)).length / want.length : 1;
}

export async function POST(req: Request) {
  if (rateLimited(req, 30, 60_000, "locate")) return NextResponse.json({ error: "slow-down" }, { status: 429 });
  let body: { q?: string; near?: { lat: number; lng: number }; radius?: number; city?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const q = String(body.q ?? "").trim().slice(0, 100);
  const near = body.near;
  if (q.length < 3 || !near || !Number.isFinite(near.lat) || !Number.isFinite(near.lng)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const radius = Math.min(120, Math.max(10, Number(body.radius) || 40));
  const town = String(body.city ?? "").split(",")[0].trim();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(town && !q.toLowerCase().includes(town.toLowerCase()) ? `${q} ${town}` : q)}` +
        `&lat=${near.lat}&lon=${near.lng}&limit=8&lang=en`,
      { headers: { "User-Agent": "Uncover/0.5 (https://clod-orpin.vercel.app; travel planner prototype)" }, signal: ctrl.signal },
    );
    const data = res.ok ? await res.json() : null;
    for (const f of data?.features ?? []) {
      const [lng, lat] = f.geometry?.coordinates ?? [];
      const p = f.properties ?? {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || milesApart(near, { lat, lng }) > radius) continue;
      // A whole city or region isn't a place to measure from
      if (p.osm_key === "place" && ["city", "town", "state", "country", "county", "region"].includes(p.osm_value)) continue;
      // A name (not a street address) must mostly match: "zzqqxx nowhere" isn't the bar called "NowHere"
      if (!/\d/.test(q) && coverage(q, p.name ? String(p.name) : String(p.street ?? ""), town) < 0.6) continue;
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const area = [street, p.district || p.locality || p.city].filter(Boolean).join(", ");
      return NextResponse.json({ found: { name: String(p.name || street || q).slice(0, 60), area: area.slice(0, 80), lat, lng } });
    }
    return NextResponse.json({ found: null });
  } catch {
    return NextResponse.json({ error: "lookup-failed" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
