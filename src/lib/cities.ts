"use client";

import { useEffect } from "react";
import { milesBetween } from "./geo";
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
