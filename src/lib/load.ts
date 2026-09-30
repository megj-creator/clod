import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { City, Place } from "./types";

// Reads a city and all its place files from /data at build time.
// CORE_SCHEMA keeps dates like 2026-10-01 as plain text instead of converting them.
export function loadCity(id: string): City {
  const dir = path.join(process.cwd(), "data", "cities", id);
  const read = (file: string) =>
    yaml.load(fs.readFileSync(file, "utf8"), { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;

  const city = read(path.join(dir, "city.yaml")) as Omit<City, "places">;
  const placesDir = path.join(dir, "places");

  const places = fs
    .readdirSync(placesDir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
    .sort()
    .map((f) => {
      const raw = read(path.join(placesDir, f)) as Partial<Place>;
      const missing = (["id", "name", "category", "location", "price"] as const).filter((k) => !raw[k]);
      if (missing.length) {
        throw new Error(`Place file "${f}" is missing: ${missing.join(", ")}`);
      }
      return {
        tags: [],
        moods: [],
        photos: [],
        depth: 2,
        bestTime: "anytime",
        durationMin: 60,
        indoor: false,
        whyFound: "",
        insiderTip: "",
        localsSay: { text: "", sourced: false },
        rainPlan: { text: "" },
        booking: { best: "", tips: [], lastChecked: null },
        hypeCheck: { score: 3, text: "" },
        kidFit: { score: 2, stroller: true, notes: "" },
        ...raw,
        realityCheck: { hours: "", officialUrl: "", lastChecked: null, warnings: [], ...raw.realityCheck },
      } as Place;
    });

  const ids = new Set<string>();
  for (const p of places) {
    if (ids.has(p.id)) throw new Error(`Two places share the id "${p.id}"`);
    ids.add(p.id);
  }

  return { ...city, places };
}
