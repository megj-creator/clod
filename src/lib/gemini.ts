import { unstable_cache } from "next/cache";

// Server-only helper for calling Gemini. Retries when Google is busy and
// falls back to a lighter model, so a demand spike doesn't break the app.

const FLASH = process.env.GEMINI_MODEL || "gemini-flash-latest";
const LITE = "gemini-flash-lite-latest";
const MODELS = [FLASH, LITE];
// For long lists where speed matters more than polish (filling a whole city): lite first
export const FAST_MODELS = [LITE, FLASH];

export type GeminiResult = { text: string; sources: { title: string; url: string }[]; model: string };

export function geminiKey() {
  // Strip invisible characters (e.g. a byte-order mark from a Windows paste) so the header stays valid.
  return process.env.GEMINI_API_KEY?.replace(/[^\x21-\x7e]/g, "") || "";
}

export async function callGemini(opts: {
  system: string;
  prompt: string;
  schema?: object;
  json?: boolean; // JSON output without a schema: much faster on the lite model for long lists
  search?: boolean;
  temperature?: number;
  timeoutMs?: number;
  models?: string[];
  deadline?: number; // epoch ms: never wait past this, so the route finishes inside the host's time limit
}): Promise<GeminiResult> {
  const key = geminiKey();
  if (!key) throw new Error("no-key");

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  let lastError = "unknown";
  for (const model of opts.models ?? MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = (opts.deadline ?? Infinity) - Date.now();
      if (left < 4000) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(opts.timeoutMs ?? 25_000, left));
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const cand = data.candidates?.[0];
          const text = (cand?.content?.parts ?? [])
            .filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text?: string }) => p.text ?? "")
            .join("");
          const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
            .map((c: { web?: { title?: string; uri?: string } }) => ({ title: c.web?.title ?? "", url: c.web?.uri ?? "" }))
            .filter((s: { url: string }) => s.url);
          if (text) return { text, sources, model };
          lastError = "empty";
        } else {
          lastError = `${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`;
          // Only retry on "busy" errors. A quota 429 won't clear in a second, so move on to the lighter model.
          if (![500, 503, 504].includes(res.status)) break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        // Too slow: waiting on the same model again would blow the time budget, so try the lighter one
        if (ctrl.signal.aborted) {
          clearTimeout(timer);
          break;
        }
      } finally {
        clearTimeout(timer);
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  console.error("Gemini failed:", lastError);
  throw new Error(`gemini-failed ${lastError.slice(0, 3)}`);
}

// Pulls a JSON value out of model text, tolerating ```json fences or chatter around it.
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.search(/[[{]/);
    const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    const body = raw.slice(start, end + 1);
    try {
      return JSON.parse(body) as T;
    } catch (e) {
      // Lite models sometimes write JavaScript-style objects: unquoted keys (one per line) and trailing commas
      const repaired = body.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/gm, '$1"$2":').replace(/,(\s*[}\]])/g, "$1");
      try {
        return JSON.parse(repaired) as T;
      } catch {
        throw e;
      }
    }
  }
}

// Tiny per-instance rate limit so a public link can't burn through the free quota.
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, max = 12, windowMs = 60_000, bucket = "default") {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

// Shared, durable cache (Next.js Data Cache: on Vercel it's shared by every server instance and
// survives restarts), so the second person to search "Lisbon" gets it instantly and spends no quota.
// Errors aren't cached: a failed lookup is retried next time.
// Bump CACHE_VERSION whenever the shape or quality of cached cities/places changes.
const CACHE_VERSION = "uncover-v5";
export async function cached<T>(key: string, ttlMs: number, make: () => Promise<T>): Promise<T> {
  return unstable_cache(make, [CACHE_VERSION, key], { revalidate: Math.round(ttlMs / 1000) })();
}
