"use client";

import { useEffect } from "react";
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

// One small request per category: short lists come back fast and in parallel
const GROUPS: Category[][] = [["eat"], ["explore"], ["history"], ["family"], ["music"]];

// Folds a batch of places into the searched city and marks those categories done (or failed).
function merge(s: AppState, cityId: string, cats: Category[], places: Place[] | null): AppState {
  const city = s.city;
  const g = city?.generated;
  if (!city || !g || city.id !== cityId) return s;
  const names = new Set(city.places.map((p) => norm(p.name)));
  const ids = new Set(city.places.map((p) => p.id));
  const fresh = (places ?? []).filter((p) => !names.has(norm(p.name)) && !ids.has(p.id) && names.add(norm(p.name)));
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
