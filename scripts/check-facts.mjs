// Reads each place's OFFICIAL website and has Gemini pull out hours, seasonal closures,
// and prices, using only what the site actually says. Saves results to checks.json
// with a "last checked" date. The app shows those instead of the unverified text.
// Run:  npm run check-facts           (needs GEMINI_API_KEY in .env.local)
//       npm run check-facts -- --only=id1,id2   to redo specific places

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const city = "charleston";
const dir = path.join(process.cwd(), "data", "cities", city);
const outFile = path.join(dir, "checks.json");
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const key = (process.env.GEMINI_API_KEY ?? "").replace(/[^\x21-\x7e]/g, "");
if (!key) throw new Error("GEMINI_API_KEY missing (put it in .env.local)");
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Accept: "text/html" }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    return { html: await res.text(), url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const toText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|li|h\d|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

// Follow the most useful internal links: hours / visit / plan / tickets / admission
function usefulLinks(html, base) {
  const out = new Set();
  const origin = new URL(base).origin;
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = toText(m[2]).toLowerCase();
    const href = m[1];
    if (!/hour|visit|plan|ticket|admission|pricing|rates|info|contact|location/.test(label + " " + href.toLowerCase())) continue;
    try {
      const u = new URL(href, base);
      if (u.origin === origin && !/\.(pdf|jpg|png)$/i.test(u.pathname)) out.add(u.href.split("#")[0]);
    } catch {}
    if (out.size >= 3) break;
  }
  return [...out];
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN", description: "true only if the page text states opening hours" },
    hours: { type: "STRING", description: "Concise opening hours exactly as stated, e.g. 'Daily 9 AM–5 PM' or 'Tue–Sat 11 AM–9 PM, closed Sun–Mon'" },
    seasonal: { type: "STRING", description: "Seasonal changes or closures mentioned (empty if none)" },
    closures: { type: "ARRAY", items: { type: "STRING" }, description: "Specific closure days/holidays or alerts mentioned" },
    adultPrice: { type: "NUMBER", description: "General adult admission or typical per-person price in USD if stated, else 0" },
    priceNote: { type: "STRING", description: "Short price summary if stated (empty if not)" },
    booking: { type: "STRING", description: "How the official site says to book/reserve (empty if not stated)" },
    evidence: { type: "STRING", description: "A short verbatim snippet from the page that supports the hours" },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
  },
  required: ["found", "hours", "seasonal", "closures", "adultPrice", "priceNote", "booking", "evidence", "confidence"],
};

async function extract(name, text) {
  const body = {
    systemInstruction: {
      parts: [{ text: "You extract facts from an official website's text. Use ONLY the text provided. Never guess or use outside knowledge. If hours aren't in the text, set found=false and leave hours empty." }],
    },
    contents: [{ role: "user", parts: [{ text: `Place: ${name}\nToday: ${today}\n\nWEBSITE TEXT:\n${text.slice(0, 24000)}` }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
  };
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const t = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
        return JSON.parse(t);
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
  throw new Error("Gemini unavailable");
}

const checks = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
const files = fs.readdirSync(path.join(dir, "places")).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));
for (const f of files) {
  const p = yaml.load(fs.readFileSync(path.join(dir, "places", f), "utf8"), { schema: yaml.CORE_SCHEMA });
  const url = p.realityCheck?.officialUrl;
  if (!url) continue;
  if (only.length && !only.includes(p.id)) continue;
  if (!only.length && checks[p.id]?.checked === today) continue;

  const home = await get(url);
  if (!home) {
    checks[p.id] = { checked: today, url, status: "unreachable" };
    console.log(`✗  ${p.name}: couldn't load ${url}`);
    continue;
  }
  let text = `[${home.url}]\n${toText(home.html)}`;
  for (const link of usefulLinks(home.html, home.url)) {
    const pg = await get(link);
    if (pg) text += `\n\n[${pg.url}]\n${toText(pg.html)}`;
  }
  if (text.length < 400) {
    checks[p.id] = { checked: today, url: home.url, status: "no-text" };
    console.log(`?  ${p.name}: site has almost no readable text (probably built with JavaScript)`);
    continue;
  }
  try {
    const r = await extract(p.name, text);
    checks[p.id] = { checked: today, url: home.url, status: r.found ? "ok" : "no-hours", ...r };
    console.log(`${r.found ? "✓" : "·"}  ${p.name}: ${r.found ? `${r.hours} [${r.confidence}]` : "no hours on site"}${r.priceNote ? ` · ${r.priceNote}` : ""}`);
  } catch (e) {
    console.log(`!  ${p.name}: ${e.message}`);
  }
  fs.writeFileSync(outFile, JSON.stringify(checks, null, 1));
  await sleep(6500); // stay under the free tier's per-minute limit
}
fs.writeFileSync(outFile, JSON.stringify(checks, null, 1));
console.log(`\nSaved ${path.join("data", "cities", city, "checks.json")}`);
