import { NextResponse } from "next/server";
import { milesApart, roadMinutes } from "@/lib/finder";
import { rateLimited } from "@/lib/gemini";

// Real road minutes from the traveler's own hotel to each place (one free OSRM routing request).
export const maxDuration = 20;

type Pt = { id?: string; lat: number; lng: number };

export async function POST(req: Request) {
  if (rateLimited(req, 10, 60_000, "drive-times")) return NextResponse.json({ error: "slow-down" }, { status: 429 });
  let body: { from?: Pt; to?: Pt[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const ok = (p?: Pt) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  const from = body.from;
  if (!ok(from)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  // Only places plausibly reachable by road from here
  const to = (body.to ?? []).filter((p) => ok(p) && p.id && milesApart(from!, p) < 150).slice(0, 90);
  if (!to.length) return NextResponse.json({ times: {} });
  const [row] = await roadMinutes([from!], to);
  const times: Record<string, number> = {};
  to.forEach((p, i) => {
    if (row?.[i] != null) times[String(p.id)] = row[i]!;
  });
  return NextResponse.json({ times });
}
