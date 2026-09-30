import { NextResponse } from "next/server";
import { callGemini, geminiKey, parseJsonLoose, rateLimited } from "@/lib/gemini";

// Reads what the traveler typed and picks matching places from the curated list.
// Set GEMINI_API_KEY in Vercel (Settings → Environment Variables) and in .env.local for local runs.

type PlaceSummary = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  tags: string[];
  depth: number;
  price: number;
  indoor: boolean;
  kidFit: number;
  bestTime: string;
  drive: number;
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    heard: { type: "ARRAY", items: { type: "STRING" }, description: "2–4 very short phrases summarizing what the traveler asked for, e.g. 'dinner', 'toddler-friendly', 'not fancy'" },
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          why: { type: "STRING", description: "One warm sentence (max 20 words) on why this fits their request specifically" },
        },
        required: ["id", "why"],
      },
    },
  },
  required: ["heard", "picks"],
};

export async function POST(req: Request) {
  if (!geminiKey()) return NextResponse.json({ error: "no-key" }, { status: 503 });
  if (rateLimited(req)) return NextResponse.json({ error: "slow-down" }, { status: 429 });

  let body: { text?: string; places?: PlaceSummary[]; crew?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const text = String(body.text ?? "").slice(0, 500).trim();
  const places = Array.isArray(body.places) ? body.places.slice(0, 200) : [];
  if (!text || !places.length) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const system = [
    "You are Uncover, a travel-obsessed local friend who already did the research.",
    "Given what a traveler typed and a list of places (with drive minutes from their stay, price per person, kid fit 1-3, depth 1=famous 3=deep cut),",
    "pick the places that genuinely fit, best first. Pick 1–6. Only use ids from the list. Never invent places or facts.",
    "Respect constraints strictly: kids → kidFit ≥ 2; 'not fancy' → no special-occasion spots; 'close'/'tired' → short drives; 'rain' → indoor only; 'less touristy' → depth ≥ 2.",
    "Never pick two dinner restaurants for the same evening unless asked. If nothing fits well, return the closest 1–2 and say honestly why in 'why'.",
  ].join(" ");

  try {
    const out = await callGemini({
      system,
      prompt: `Traveling party: ${body.crew || "unknown"}\nThey typed: "${text}"\n\nPlaces:\n${JSON.stringify(places)}`,
      schema: SCHEMA,
    });
    const parsed = parseJsonLoose<{ heard: string[]; picks: { id: string; why: string }[] }>(out.text);
    const valid = new Set(places.map((p) => p.id));
    const picks = (parsed.picks ?? []).filter((p) => valid.has(p.id)).slice(0, 6);
    return NextResponse.json({ heard: (parsed.heard ?? []).slice(0, 4), picks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
