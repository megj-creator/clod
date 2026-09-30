import { NextResponse } from "next/server";
import { findPlaces } from "@/lib/finder";
import { geminiKey, guardGemini } from "@/lib/gemini";

// "Dig deeper → Go hunting": Gemini searches the live web (Google Search grounding)
// for real places beyond what's already shown, favoring local voices over tourist sites.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!geminiKey()) return NextResponse.json({ error: "no-key" }, { status: 503 });
  const blocked = guardGemini(req, "hunt", 4, 80);
  if (blocked) return NextResponse.json({ error: blocked }, { status: blocked === "forbidden" ? 403 : 429 });

  let body: {
    city?: string;
    stay?: { id?: string; name: string; lat: number; lng: number };
    request?: string;
    crew?: string;
    maxDrive?: number;
    travel?: string;
    maxPrice?: number;
    exclude?: string[];
    liked?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const city = String(body.city ?? "").slice(0, 80);
  const stay = body.stay;
  if (!city || !stay || !Number.isFinite(stay.lat) || !Number.isFinite(stay.lng)) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const crew = String(body.crew ?? "unknown").slice(0, 80);
  try {
    const out = await findPlaces({
      city,
      center: stay,
      stays: stay.id ? [{ id: String(stay.id), name: stay.name, area: "", lat: stay.lat, lng: stay.lng }] : [],
      ask: `4 places. They want: ${String(body.request ?? "something great that most visitors miss").slice(0, 300)}`,
      context: `Staying near: ${String(stay.name).slice(0, 60)}
Traveling party: ${crew}
Limits: max ${Number(body.maxDrive) || 45} minutes ${body.travel === "walk" ? "on foot or by public transit (they have no car)" : "drive"}, max $${Number(body.maxPrice) || 50} per person
They've liked: ${(body.liked ?? []).slice(0, 12).join(", ") || "nothing yet"}`,
      exclude: body.exclude,
      count: 5,
      idPrefix: "live",
      origin: "hunt",
      kids: /toddler|baby|kid|child/i.test(crew),
    });
    // Hunted finds are the deep end of the deck
    out.places.forEach((p) => (p.depth = 3));
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
