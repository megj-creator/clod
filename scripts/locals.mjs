// "What locals are saying", from REAL local threads on the city's subreddit.
// For each place: search the subreddit, read the top comments that mention it,
// and have Gemini paraphrase what locals say (no usernames, no quotes lifted wholesale).
// Saves to locals.json with links to the threads, and the app marks it "From local threads".
//
// Needs Reddit API access (see README "Real local voices"):
//   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, GEMINI_API_KEY   in .env.local
// Run:  npm run locals

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const city = "charleston";
const dir = path.join(process.cwd(), "data", "cities", city);
const cfg = yaml.load(fs.readFileSync(path.join(dir, "city.yaml"), "utf8"), { schema: yaml.CORE_SCHEMA });
const sub = cfg.subreddit;
const outFile = path.join(dir, "locals.json");
const UA = "web:uncover:0.3 (travel app prototype; https://github.com/megj-creator/clod)";
const gemKey = (process.env.GEMINI_API_KEY ?? "").replace(/[^\x21-\x7e]/g, "");
const id = process.env.REDDIT_CLIENT_ID;
const secret = process.env.REDDIT_CLIENT_SECRET;
if (!id || !secret) {
  console.log("Reddit keys not set yet. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to .env.local once Reddit approves access.");
  process.exit(0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// App-only OAuth token
const tok = await fetch("https://www.reddit.com/api/v1/access_token", {
  method: "POST",
  headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
}).then((r) => r.json());
if (!tok.access_token) throw new Error(`Reddit auth failed: ${JSON.stringify(tok)}`);
const reddit = async (p) => {
  const res = await fetch(`https://oauth.reddit.com${p}`, { headers: { Authorization: `Bearer ${tok.access_token}`, "User-Agent": UA } });
  await sleep(1100); // well under Reddit's free rate limit
  return res.ok ? res.json() : null;
};

async function summarize(name, snippets) {
  const body = {
    systemInstruction: {
      parts: [
        {
          text: "Summarize what LOCALS say about a place, using only the comments given. Paraphrase in 1–2 sentences, in a friendly, honest voice. Include real caveats. No usernames. No direct quotes longer than 6 words. If the comments don't really discuss the place, reply exactly: NONE",
        },
      ],
    },
    contents: [{ role: "user", parts: [{ text: `Place: ${name}\n\nComments from r/${sub}:\n${snippets.join("\n---\n").slice(0, 16000)}` }] }],
    generationConfig: { temperature: 0.3 },
  };
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": gemKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const t = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  return t && t !== "NONE" ? t : null;
}

const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
const files = fs.readdirSync(path.join(dir, "places")).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));
for (const f of files) {
  const p = yaml.load(fs.readFileSync(path.join(dir, "places", f), "utf8"), { schema: yaml.CORE_SCHEMA });
  const short = p.name.replace(/^The\s+/i, "").replace(/\s*[&,(].*$/, "");
  const search = await reddit(`/r/${sub}/search?q=${encodeURIComponent(`"${short}"`)}&restrict_sr=1&sort=relevance&t=all&limit=8`);
  const threads = (search?.data?.children ?? []).map((c) => c.data).filter((t) => t.num_comments > 3);
  const snippets = [];
  const sources = [];
  for (const t of threads.slice(0, 4)) {
    const thread = await reddit(`/comments/${t.id}?limit=60&depth=2&sort=top`);
    const comments = (thread?.[1]?.data?.children ?? []).map((c) => c.data?.body ?? "").filter(Boolean);
    const hits = comments.filter((c) => c.toLowerCase().includes(short.toLowerCase().split(" ")[0]));
    if (hits.length) {
      snippets.push(...hits.slice(0, 8));
      sources.push({ title: t.title.slice(0, 90), url: `https://www.reddit.com${t.permalink}` });
    }
  }
  if (!snippets.length) {
    console.log(`·  ${p.name}: no local discussion found`);
    continue;
  }
  const text = await summarize(p.name, snippets);
  if (text) {
    out[p.id] = { checked: new Date().toISOString().slice(0, 10), text, sources };
    console.log(`✓  ${p.name}: ${text}`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  }
  await sleep(4000);
}
console.log(`\nSaved ${path.join("data", "cities", city, "locals.json")}`);
