import { NextResponse } from "next/server";

// Server-only: the Gemini key never reaches the browser.
// Set GEMINI_API_KEY in Vercel (Settings → Environment Variables) and in .env.local for local runs.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

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

// Tiny per-instance rate limit so a public link can't burn through the free quota.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

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
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "no-key" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "slow-down" }, { status: 429 });

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
    "If nothing fits well, return the closest 1–2 and say honestly why in 'why'.",
  ].join(" ");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `Traveling party: ${body.crew || "unknown"}\nThey typed: "${text}"\n\nPlaces:\n${JSON.stringify(places)}` }],
        },
      ],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Gemini error", res.status, detail.slice(0, 500));
    return NextResponse.json({ error: "gemini-failed" }, { status: 502 });
  }

  const data = await res.json();
  try {
    const raw = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(raw) as { heard: string[]; picks: { id: string; why: string }[] };
    const valid = new Set(places.map((p) => p.id));
    const picks = parsed.picks.filter((p) => valid.has(p.id)).slice(0, 6);
    return NextResponse.json({ heard: parsed.heard.slice(0, 4), picks });
  } catch {
    return NextResponse.json({ error: "bad-ai-response" }, { status: 502 });
  }
}
