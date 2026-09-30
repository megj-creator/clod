// Fills in map coordinates for any place whose file still says "lat: 0",
// using the place's address and OpenStreetMap's free geocoder (Nominatim).
// Run:  npm run geocode
// Nominatim's rules: max 1 request per second, identify the app. We follow both.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const city = process.argv[2] || "charleston";
const dir = path.join(process.cwd(), "data", "cities", city);
const cfg = yaml.load(fs.readFileSync(path.join(dir, "city.yaml"), "utf8"), { schema: yaml.CORE_SCHEMA });
const center = cfg.stays[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const miles = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

async function lookup(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Uncover/0.3 (https://github.com/megj-creator/clod)" } });
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
}

const files = fs.readdirSync(path.join(dir, "places")).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"));
let done = 0;
const problems = [];
for (const f of files) {
  const file = path.join(dir, "places", f);
  const text = fs.readFileSync(file, "utf8");
  const p = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  if (p.location?.lat) continue;

  // Try the exact address, then the name + city, then the street without the number
  const tries = [p.location.address, `${p.name}, ${p.location.address}`, p.location.address.replace(/^\d+\s+/, "")];
  let hit = null;
  for (const q of tries) {
    hit = await lookup(q);
    await sleep(1100);
    if (hit && miles(center, hit) < 60) break;
    hit = null;
  }
  if (!hit) {
    problems.push(`${p.id}: couldn't find "${p.location.address}"`);
    continue;
  }
  const updated = text
    .replace(/^(\s+lat:)\s*0\b.*$/m, `$1 ${hit.lat.toFixed(5)}`)
    .replace(/^(\s+lng:)\s*0\b.*$/m, `$1 ${hit.lng.toFixed(5)}`);
  fs.writeFileSync(file, updated);
  done++;
  console.log(`✓ ${p.name}  →  ${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)}  (${hit.label.split(",").slice(0, 3).join(",")})`);
}
console.log(`\nGeocoded ${done} places.`);
if (problems.length) console.log("Needs a hand:\n  " + problems.join("\n  "));
