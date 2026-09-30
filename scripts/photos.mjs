// Finds freely licensed photos on Wikimedia Commons for places that have none ("photos: []").
// A photo only counts if its file name mentions the place, so we don't show a random building.
// Run:  npm run photos        (add --dry to preview without writing)

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const city = process.argv.find((a) => !a.startsWith("-") && !a.includes("photos.mjs") && !a.includes("node")) || "charleston";
const dry = process.argv.includes("--dry");
const dir = path.join(process.cwd(), "data", "cities", city);
const cfg = yaml.load(fs.readFileSync(path.join(dir, "city.yaml"), "utf8"), { schema: yaml.CORE_SCHEMA });
const UA = { "User-Agent": "Uncover/0.3 (https://github.com/megj-creator/clod)" };
const STOP = new Set(["the", "and", "of", "restaurant", "bar", "grill", "cafe", "house", "co", "company", "shop", "sc", "museum", "park", "site", "historic", city.toLowerCase(), "cafe", "place"]);
const OK_LICENSES = /^(cc0|public domain|pd|cc by(-sa)?( \d\.\d)?)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s = "") => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 60);

async function find(p) {
  const words = p.name.toLowerCase().replace(/&/g, " ").split(/[^a-z0-9']+/).map((w) => w.replace(/'s$/, "")).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return [];
  const q = encodeURIComponent(`${p.name.replace(/&/g, "")} ${cfg.name}`);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return [];
  const data = await res.json();
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .filter((pg) => {
      const info = pg.imageinfo?.[0];
      const title = pg.title.toLowerCase();
      const lic = info?.extmetadata?.LicenseShortName?.value ?? "";
      return (
        info &&
        ["image/jpeg", "image/png"].includes(info.mime) &&
        info.width >= 1000 &&
        info.width >= info.height * 0.9 && // landscape-ish reads best on cards
        OK_LICENSES.test(lic) &&
        words.every((w) => title.includes(w))
      );
    })
    .slice(0, 3)
    .map((pg) => {
      const info = pg.imageinfo[0];
      return { src: (info.thumburl || info.url).replace(/\?.*$/, ""), credit: clean(info.extmetadata?.Artist?.value) || "Unknown", license: info.extmetadata.LicenseShortName.value, source: info.descriptionurl };
    });
}

const q = (s) => JSON.stringify(s);
let added = 0;
for (const f of fs.readdirSync(path.join(dir, "places")).filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))) {
  const file = path.join(dir, "places", f);
  const text = fs.readFileSync(file, "utf8");
  if (!/^photos:[ \t]*\[\][ \t]*$/m.test(text)) continue;
  const p = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  const photos = await find(p);
  await sleep(400);
  if (!photos.length) {
    console.log(`·  ${p.name}: nothing suitable`);
    continue;
  }
  const block = "photos:\n" + photos.map((ph) => `  - src: ${ph.src}\n    credit: ${q(ph.credit)}\n    license: ${q(ph.license)}\n    source: ${ph.source}`).join("\n");
  if (!dry) fs.writeFileSync(file, text.replace(/^photos:[ \t]*\[\][ \t]*$/m, block));
  added++;
  console.log(`✓  ${p.name}: ${photos.length} photo(s) — ${photos.map((ph) => ph.credit).join(", ")}`);
}
console.log(`\n${dry ? "Would add" : "Added"} photos to ${added} places.`);
