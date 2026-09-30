import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { City, Place } from "./types";

type Check = {
  checked: string;
  url: string;
  status: "ok" | "no-hours" | "unreachable" | "no-text";
  hours?: string;
  seasonal?: string;
  closures?: string[];
  adultPrice: number;
  priceNote?: string;
  booking?: string;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
};

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

  // Overlay facts checked against official websites (scripts/check-facts.mjs).
  // A date you typed into a place file yourself always wins over the automatic check.
  const checksFile = path.join(dir, "checks.json");
  const checks: Record<string, Check> = fs.existsSync(checksFile) ? JSON.parse(fs.readFileSync(checksFile, "utf8")) : {};
  for (const p of places) {
    const c = checks[p.id];
    if (!c || p.realityCheck.lastChecked) continue;
    if (c.status === "ok" && c.confidence !== "low" && c.hours) {
      p.realityCheck = {
        ...p.realityCheck,
        hours: c.hours,
        seasonal: c.seasonal || p.realityCheck.seasonal,
        warnings: [...(p.realityCheck.warnings ?? []), ...(c.closures ?? []).slice(0, 3)],
        lastChecked: c.checked,
        checkedUrl: c.url,
        evidence: c.evidence?.slice(0, 200),
      };
      if (c.priceNote) p.price = { ...p.price, note: `${c.priceNote} (per the official site)` };
      if (c.adultPrice > 0 && p.category !== "eat" && p.category !== "music") p.price = { ...p.price, perPerson: Math.round(c.adultPrice) };
      if (c.booking) p.booking = { ...p.booking, tips: [...(p.booking.tips ?? []), `Official site says: ${c.booking}`], lastChecked: c.checked };
    } else {
      p.realityCheck = {
        ...p.realityCheck,
        checkNote:
          c.status === "unreachable"
            ? `The official site didn't load when checked on ${c.checked}. Call ahead.`
            : `Checked the official site on ${c.checked}, but it doesn't list hours clearly. Call ahead.`,
        checkedUrl: c.url,
      };
    }
  }

  // Overlay real local voices from scripts/locals.mjs (Reddit), when available
  const localsFile = path.join(dir, "locals.json");
  const locals: Record<string, { checked: string; text: string; sources: { title: string; url: string }[] }> = fs.existsSync(localsFile)
    ? JSON.parse(fs.readFileSync(localsFile, "utf8"))
    : {};
  for (const p of places) {
    const l = locals[p.id];
    if (l?.text) p.localsSay = { text: l.text, sourced: true, sources: l.sources, checked: l.checked };
  }

  const ids = new Set<string>();
  for (const p of places) {
    if (ids.has(p.id)) throw new Error(`Two places share the id "${p.id}"`);
    ids.add(p.id);
  }

  const drivesFile = path.join(dir, "drives.json");
  const drives = fs.existsSync(drivesFile) ? JSON.parse(fs.readFileSync(drivesFile, "utf8")) : undefined;

  return { ...city, places, drives };
}
