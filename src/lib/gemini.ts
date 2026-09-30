// Server-only helper for calling Gemini. Retries when Google is busy and
// falls back to a lighter model, so a demand spike doesn't break the app.

const MODELS = [process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-flash-lite-latest"];

export type GeminiResult = { text: string; sources: { title: string; url: string }[]; model: string };

export function geminiKey() {
  // Strip invisible characters (e.g. a byte-order mark from a Windows paste) so the header stays valid.
  return process.env.GEMINI_API_KEY?.replace(/[^\x21-\x7e]/g, "") || "";
}

export async function callGemini(opts: {
  system: string;
  prompt: string;
  schema?: object;
  search?: boolean;
  temperature?: number;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const key = geminiKey();
  if (!key) throw new Error("no-key");

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
    },
  };

  let lastError = "unknown";
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
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
          // Only retry on "busy" errors. A quota 429 on search won't clear by retrying.
          if (![500, 503, 504].includes(res.status) && !(res.status === 429 && !opts.search)) break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
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
    return JSON.parse(raw.slice(start, end + 1)) as T;
  }
}

// Tiny per-instance rate limit so a public link can't burn through the free quota.
const hits = new Map<string, number[]>();
export function rateLimited(req: Request, max = 12, windowMs = 60_000) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}
