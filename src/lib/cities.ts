"use client";

import { useEffect } from "react";
import { milesBetween } from "./geo";
import { osmHoursText, osmOpenDays } from "./hours";
import type { AppState, Category, City, Place } from "./types";

export class CitySearchError extends Error {}

// Looks up any destination via /api/city (OpenStreetMap + Gemini). Its places come later.
export async function searchCity(query: string): Promise<City> {
  let res: Response;
  try {
    res = await fetch("/api/city", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
  } catch {
    throw new CitySearchError("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.city) return data.city as City;
  if (res.status === 404) throw new CitySearchError(`I couldn't find "${query}" on the map. Try adding the state or country.`);
  if (res.status === 503) throw new CitySearchError("Searching new places needs the Gemini key (see the README).");
  if (res.status === 429) throw new CitySearchError("That's a lot of searching at once. Give me a minute.");
  throw new CitySearchError("Couldn't reach the AI just now. Try again in a moment.");
}

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["the", "and"].includes(w));

// Two categories can name one place differently ("Fushimi Inari Shrine" in explore, "Fushimi Inari Taisha"
// in history, pinned ~550 m apart on a big shrine complex). Close by (within ~800 m) plus a strong name
// match (one name contains the other, or 2+ words and most of them shared) means it's already there.
// One shared word never counts: "Gion Corner" and "Gion Tanto" are different places on the same street.
function sameSpot(a: Place, b: Place): boolean {
  if (norm(a.name) === norm(b.name)) return true;
  if (milesBetween(a.location, b.location) > 0.5) return false;
  const wa = words(a.name);
  const wb = new Set(words(b.name));
  const shared = wa.filter((w) => wb.has(w)).length;
  const ratio = shared / Math.max(1, Math.min(wa.length, wb.size));
  return ratio === 1 || (shared >= 2 && ratio >= 0.6);
}

// One small request per category: short lists come back fast and in parallel
const GROUPS: Category[][] = [["eat"], ["explore"], ["history"], ["family"], ["music"]];

// Folds a batch of places into the searched city and marks those categories done (or failed).
function merge(s: AppState, cityId: string, cats: Category[], places: Place[] | null): AppState {
  const city = s.city;
  const g = city?.generated;
  if (!city || !g || city.id !== cityId) return s;
  const kept = [...city.places];
  const ids = new Set(kept.map((p) => p.id));
  const fresh: Place[] = [];
  for (const p of places ?? []) {
    if (ids.has(p.id) || kept.some((q) => sameSpot(p, q))) continue;
    kept.push(p);
    ids.add(p.id);
    fresh.push(p);
  }
  return {
    ...s,
    city: {
      ...city,
      places: [...city.places, ...fresh],
      generated: {
        ...g,
        pending: g.pending.filter((c) => !cats.includes(c)),
        failed: places ? g.failed.filter((c) => !cats.includes(c)) : [...new Set([...g.failed, ...cats])],
      },
    },
  };
}

type OsmFacts = { hours?: string; website?: string; checked?: string; closed: boolean };

const osmRef = (p: Place) => p.realityCheck.osm?.url?.replace(/^.*openstreetmap\.org\//, "");

// OpenStreetMap's hours/website/closed flags for places matched there (one request)
export async function fetchOsmFacts(places: Place[], signal?: AbortSignal): Promise<Record<string, OsmFacts>> {
  const refs = places.map(osmRef).filter(Boolean);
  if (!refs.length) return {};
  const res = await fetch("/api/osm-facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refs }),
    signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { facts: Record<string, OsmFacts> }).facts ?? {};
}

// One place with OpenStreetMap's facts folded in. "closed" when mappers marked it closed.
export function withFacts(p: Place, facts: Record<string, OsmFacts>): Place | "closed" {
  const ref = osmRef(p);
  const f = ref ? facts[ref] : undefined;
  if (!f) return p;
  const rc = { ...p.realityCheck, osm: { ...p.realityCheck.osm!, checked: f.checked } };
  const next: Place = { ...p, realityCheck: rc };
  if (f.closed) return "closed";
  if (f.hours) {
    rc.osm.hours = f.hours;
    rc.hours = osmHoursText(f.hours);
    next.openDays = osmOpenDays(f.hours);
  }
  if (f.website && /^https?:\/\//.test(f.website)) rc.officialUrl = f.website;
  return next;
}

// Folds OpenStreetMap's facts into the searched city's places.
function applyFacts(s: AppState, cityId: string, facts: Record<string, OsmFacts> | null): AppState {
  const city = s.city;
  if (!city?.generated || city.id !== cityId) return s;
  if (!facts) return { ...s, city: { ...city, generated: { ...city.generated, facts: "failed" } } };
  const places: Place[] = [];
  for (const p of city.places) {
    const next = withFacts(p, facts);
    if (next !== "closed") places.push(next);
    // Marked closed by local mappers: drop it, unless it's already saved (then say so)
    else if (s.saved.includes(p.id))
      places.push({ ...p, realityCheck: { ...p.realityCheck, warnings: [...(p.realityCheck.warnings ?? []), "OpenStreetMap lists this as closed. Check before you go."] } });
  }
  return { ...s, city: { ...city, places, generated: { ...city.generated, facts: "done" } } };
}

// Once every category is in: one OpenStreetMap request for the whole city's hours
export function useOsmFacts(state: AppState, update: (fn: (s: AppState) => AppState) => void) {
  const city = state.city;
  const g = city?.generated;
  const ready = !!g && !g.pending.length && !g.facts;
  useEffect(() => {
    if (!ready || !city) return;
    const ctrl = new AbortController();
    fetchOsmFacts(city.places, ctrl.signal)
      .then((facts) => update((s) => applyFacts(s, city.id, facts)))
      .catch(() => {
        if (!ctrl.signal.aborted) update((s) => applyFacts(s, city.id, null));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.id, ready]);
}

// While a searched city still has categories pending, fetch them all in parallel.
// Resumes after a reload; `retry` re-runs it after failed categories are re-queued.
export function usePlaceLoader(state: AppState, update: (fn: (s: AppState) => AppState) => void, retry: number) {
  const city = state.city;
  useEffect(() => {
    const g = city?.generated;
    if (!city || !g?.pending.length) return;
    const ctrl = new AbortController();
    const load = (cats: Category[], triesLeft: number): Promise<void> =>
      fetch("/api/places", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city: { id: city.id, name: city.name, state: city.state, lat: g.lat, lng: g.lng, radius: g.radius },
          stays: city.stays,
          categories: cats,
        }),
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { places: Place[] };
          update((s) => merge(s, city.id, cats, data.places ?? []));
        })
        .catch(async () => {
          if (ctrl.signal.aborted) return;
          // Usually a per-minute quota blip: wait it out once before giving up
          if (triesLeft > 0) {
            await new Promise((r) => setTimeout(r, 20_000));
            if (!ctrl.signal.aborted) return load(cats, triesLeft - 1);
            return;
          }
          update((s) => merge(s, city.id, cats, null));
        });
    for (const group of GROUPS) {
      const cats = group.filter((c) => g.pending.includes(c));
      if (cats.length) load(cats, 1);
    }
    return () => ctrl.abort();
    // Keyed on the city and retries only, so finishing one category doesn't cancel the others
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.id, retry]);
}
