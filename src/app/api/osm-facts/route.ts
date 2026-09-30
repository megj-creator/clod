import { NextResponse } from "next/server";
import { osmFacts } from "@/lib/finder";
import { cached, rateLimited } from "@/lib/gemini";

// Opening hours, websites, and "closed" flags from OpenStreetMap for a searched city's places,
// asked once per city after all its places have arrived. Free, no key.
export const maxDuration = 30;

export async function POST(req: Request) {
  if (rateLimited(req, 6, 60_000, "osm-facts")) return NextResponse.json({ error: "slow-down" }, { status: 429 });
  let body: { refs?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const refs = [...new Set((body.refs ?? []).filter((r) => /^(node|way|relation)\/\d{1,12}$/.test(String(r))))].sort().slice(0, 120);
  if (!refs.length) return NextResponse.json({ facts: {} });
  try {
    const facts = await cached(`osm-facts:${refs.join(",")}`, 24 * 3600_000, () => osmFacts(refs));
    return NextResponse.json({ facts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
