// Looks up REAL road drive times (OpenStreetMap routing via OSRM) from every stay
// to every place, and between places, then saves them to drives.json.
// Run after adding places:   npm run drives
// Times are without traffic. They're checked once per city, not per visitor, so it's free and instant.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const city = process.argv[2] || "charleston";
const dir = path.join(process.cwd(), "data", "cities", city);
const read = (f) => yaml.load(fs.readFileSync(f, "utf8"), { schema: yaml.CORE_SCHEMA });

const cfg = read(path.join(dir, "city.yaml"));
const places = fs
  .readdirSync(path.join(dir, "places"))
  .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
  .map((f) => read(path.join(dir, "places", f)))
  .filter((p) => p?.location?.lat && p?.location?.lng);

const points = [...cfg.stays.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, stay: true })), ...places.map((p) => ({ id: p.id, lat: p.location.lat, lng: p.location.lng }))];
console.log(`Routing ${cfg.stays.length} stays × ${places.length} places…`);

const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`, {
  headers: { "User-Agent": "Uncover/0.3 (travel app prototype)" },
});
if (!res.ok) throw new Error(`Routing failed: ${res.status} ${await res.text()}`);
const data = await res.json();
if (data.code !== "Ok") throw new Error(`Routing failed: ${data.code} ${data.message ?? ""}`);

// +2 minutes to park and walk in; rounded to whole minutes
const minutes = (sec) => (sec == null ? null : Math.max(3, Math.round(sec / 60) + 2));

const out = { checked: new Date().toISOString().slice(0, 10), source: "OpenStreetMap road routing (OSRM), no traffic, +2 min to park", stays: {}, between: {} };
points.forEach((from, i) => {
  const row = {};
  points.forEach((to, j) => {
    if (i === j || to.stay) return;
    const m = minutes(data.durations[i][j]);
    if (m != null) row[to.id] = m;
  });
  if (from.stay) out.stays[from.id] = row;
  else out.between[from.id] = row;
});

fs.writeFileSync(path.join(dir, "drives.json"), JSON.stringify(out, null, 1));
console.log(`Saved ${path.join("data", "cities", city, "drives.json")}`);
for (const s of cfg.stays) {
  const row = out.stays[s.id];
  const sample = Object.entries(row).slice(0, 4).map(([k, v]) => `${k} ${v}m`).join(", ");
  console.log(`  from ${s.name}: ${sample}…`);
}
