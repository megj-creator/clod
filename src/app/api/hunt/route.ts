import { NextResponse } from "next/server";
import { callGemini, geminiKey, parseJsonLoose, rateLimited } from "@/lib/gemini";

// "Dig deeper → Go hunting": Gemini searches the live web (Google Search grounding)
// for real places beyond the curated list, favoring local voices over tourist sites.
export const maxDuration = 60;

const CATEGORIES = ["eat", "music", "explore", "family", "history"];
const TIMES = ["morning", "afternoon", "sunset", "dinner", "evening", "anytime"];

type Found = {
  name: string;
  category: string;
  tagline: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  pricePerPerson: number;
  priceLabel: string;
  bestTime: string;
  durationMin: number;
  indoor: boolean;
  kidFit: number;
  tags: string[];
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

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const milesApart = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

const STOP = new Set(["the", "and", "of", "restaurant", "bar", "grill", "cafe", "park", "house", "co", "company", "shop", "sc", "charleston"]);

async function commonsPhoto(name: string, city: string) {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return null;
  const q = encodeURIComponent(`${name} ${city.split(",")[0]}`);
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${q}` +
    `&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Uncover/0.2 (travel app prototype)" }, signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = Object.values(data.query?.pages ?? {}) as {
      title: string;
      index: number;
      imageinfo?: { thumburl?: string; url: string; width: number; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[];
    }[];
    const match = pages
      .sort((a, b) => a.index - b.index)
      .find((pg) => {
        const info = pg.imageinfo?.[0];
        const title = pg.title.toLowerCase();
        // The file name must mention the place, so we don't show a random building
        return info && ["image/jpeg", "image/png"].includes(info.mime) && info.width >= 900 && words.every((w) => title.includes(w));
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

export async function POST(req: Request) {
  if (!geminiKey()) return NextResponse.json({ error: "no-key" }, { status: 503 });
  if (rateLimited(req, 4)) return NextResponse.json({ error: "slow-down" }, { status: 429 });

  let body: {
    city?: string;
    stay?: { name: string; lat: number; lng: number };
    request?: string;
    crew?: string;
    maxDrive?: number;
    maxPrice?: number;
    exclude?: string[];
    liked?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const city = String(body.city ?? "").slice(0, 60);
  const stay = body.stay;
  if (!city || !stay || !Number.isFinite(stay.lat)) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const system = [
    "You are Uncover: an obsessive traveler who interviewed locals. Use Google Search to find REAL, currently operating places.",
    "Prefer what locals recommend (local subreddits, local newspapers and city magazines, neighborhood blogs, event calendars) over tourist listicles and review aggregators.",
    "Famous places are fine only if locals genuinely vouch for them. Never invent a place. Skip anything that appears permanently closed.",
    "Be honest: include real caveats (limited hours, crowds, not great for kids).",
    "Respond with ONLY a JSON array, no prose.",
  ].join(" ");

  const prompt = `City: ${city}
Staying near: ${stay.name} (lat ${stay.lat}, lng ${stay.lng})
Traveling party: ${body.crew || "unknown"}
Limits: max ${body.maxDrive ?? 45} minutes drive, max $${body.maxPrice ?? 50} per person
They want: ${String(body.request ?? "something great that most visitors miss").slice(0, 300)}
They've liked: ${(body.liked ?? []).slice(0, 12).join(", ") || "nothing yet"}
Already shown (do NOT repeat): ${(body.exclude ?? []).slice(0, 80).join("; ")}

Find 4 places. Return a JSON array of objects with exactly these keys:
name, category (one of ${CATEGORIES.join("|")}), tagline (max 12 words, evocative), neighborhood, address,
lat, lng (accurate coordinates), pricePerPerson (number, 0 if free), priceLabel ("Free","$","$$","$$$"),
bestTime (one of ${TIMES.join("|")}), durationMin, indoor (boolean), kidFit (1 skip with kids, 2 doable, 3 great),
tags (3-6 lowercase words), whyFound (2 sentences, friend voice, why locals love it and why it fits them),
insiderTip (1 sentence), localsSay (1-2 sentences summarizing what locals say, paraphrased, cite no usernames),
hours (typical hours as found, say "check" if unsure), rainPlan (1 sentence), booking (cheapest legit way to book or "No booking needed"),
hype (1-5), hypeText (1 honest sentence), officialUrl (official website or "").`;

  try {
    // Live Google Search first. If the key's plan doesn't include search (quota 429/403),
    // fall back to Gemini's own knowledge, and say so on every card.
    let mode: "search" | "knowledge" = "search";
    let out;
    try {
      out = await callGemini({ system, prompt, search: true, temperature: 0.5, timeoutMs: 45_000 });
    } catch (e) {
      if (!/429|403|400/.test(e instanceof Error ? e.message : "")) throw e;
      mode = "knowledge";
      out = await callGemini({
        system: `${system} You cannot browse right now: only include places you are highly confident exist and were operating recently.`,
        prompt,
        temperature: 0.4,
        timeoutMs: 40_000,
      });
    }
    const raw = parseJsonLoose<Found[]>(out.text);
    // Fuzzy de-dupe: "Waterfront Park" matches "Waterfront Park & Pineapple Fountain"
    const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
    const known = (body.exclude ?? []).map(norm);
    const excluded = { has: (n: string) => known.some((k) => k === norm(n) || k.startsWith(norm(n)) || norm(n).startsWith(k)) };
    const today = new Date().toISOString().slice(0, 10);

    const places = (Array.isArray(raw) ? raw : [])
      .filter((f) => f && f.name && !excluded.has(String(f.name)))
      .map((f) => {
        const lat = Number(f.lat);
        const lng = Number(f.lng);
        return { f, lat, lng };
      })
      // Coordinates must be plausible: within ~90 miles of where they're staying
      .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && milesApart(stay, { lat, lng }) < 90)
      .slice(0, 5)
      .map(({ f, lat, lng }) => {
        const price = clamp(f.pricePerPerson, 0, 1000, 20);
        return {
          id: `live-${slug(f.name)}`,
          name: String(f.name).slice(0, 80),
          category: CATEGORIES.includes(f.category) ? f.category : "explore",
          tagline: String(f.tagline ?? "").slice(0, 120),
          neighborhood: String(f.neighborhood ?? city).slice(0, 60),
          depth: 3,
          tags: (Array.isArray(f.tags) ? f.tags : []).map((t) => String(t).toLowerCase().replace(/\s+/g, "-")).slice(0, 6),
          moods: [],
          location: { address: String(f.address ?? "").slice(0, 160), lat, lng },
          price: { perPerson: price, label: price === 0 ? "Free" : String(f.priceLabel || "$$").slice(0, 4) },
          bestTime: TIMES.includes(f.bestTime) ? f.bestTime : "anytime",
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
          kidFit: { score: clamp(f.kidFit, 1, 3, 2), stroller: true, notes: "" },
          live: { foundAt: today, mode, sources: out.sources.slice(0, 8) },
        };
      });

    // Families: drop anything the AI itself rated "skip with kids"
    const kids = /toddler|baby|kid|child/i.test(body.crew ?? "");
    const fit = kids ? places.filter((p) => p.kidFit.score >= 2) : places;

    // Look for a freely licensed photo of each find on Wikimedia Commons (in parallel, best effort)
    await Promise.all(
      fit.map(async (p) => {
        const photo = await commonsPhoto(p.name, city);
        if (photo) p.photos = [photo] as never[];
      }),
    );

    return NextResponse.json({ places: fit, mode, model: out.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
