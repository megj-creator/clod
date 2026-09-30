import type { Intent } from "./intent";
import { affinity } from "./taste";
import type { Place, Taste, TripSetup } from "./types";

export type Ranked = { place: Place; drive: number; score: number };

function matchesTopic(place: Place, intent: Intent): boolean {
  const open = !intent.categories.length && !intent.moods.length && !intent.tags.length;
  if (open) return true;
  return (
    intent.categories.includes(place.category) ||
    intent.moods.some((m) => place.moods.includes(m)) ||
    intent.tags.some((t) => place.tags.includes(t))
  );
}

function matchesFlags(place: Place, intent: Intent, drive: number): boolean {
  const f = intent.flags;
  if (f.kid && place.kidFit.score < 2) return false;
  if (f.casual && (place.tags.includes("fancy") || place.moods.includes("special"))) return false;
  if (f.cheap && place.price.perPerson > 15) return false;
  if (f.close && drive > 20) return false;
  if (f.indoor && !place.indoor) return false;
  if (f.outdoors && place.indoor) return false;
  if (f.deeper && place.depth < 2) return false;
  return true;
}

// Found by Gemini but not matched on OpenStreetMap (curated places are always "confirmed")
export const unconfirmed = (p: Place) => !!p.live && !p.location.pin;

export function withinLimits(place: Place, drive: number, setup: TripSetup) {
  return drive <= setup.maxDrive && place.price.perPerson <= setup.maxPrice;
}

export function buildQueue(opts: {
  places: Place[];
  drives: Record<string, number>;
  intent: Intent;
  setup: TripSetup;
  taste: Taste;
  depthLevel: number;
  exclude: Set<string>;
  showHidden: boolean;
}) {
  const { places, drives, intent, setup, taste, depthLevel, exclude, showHidden } = opts;

  // Gemini already understood the request and ordered its picks best-first.
  if (intent.picks) {
    const order = Object.keys(intent.picks);
    const ranked = order
      .map((id) => places.find((p) => p.id === id))
      .filter((p): p is Place => !!p && !exclude.has(p.id) && p.depth >= depthLevel)
      .map((p, i) => ({ place: p, drive: drives[p.id], score: i }));
    const inside = ranked.filter((r) => withinLimits(r.place, r.drive, setup));
    const hidden = ranked.filter((r) => !withinLimits(r.place, r.drive, setup));
    return { queue: showHidden ? ranked : inside, hidden, relaxed: false };
  }

  const pool = places.filter((p) => !exclude.has(p.id) && p.depth >= depthLevel && matchesTopic(p, intent));

  let matched = pool.filter((p) => matchesFlags(p, intent, drives[p.id]));
  let relaxed = false;
  if (!matched.length && pool.length) {
    matched = pool;
    relaxed = true;
  }

  const rank = (p: Place): Ranked => {
    const drive = drives[p.id];
    const boost = intent.boost.filter((b) => p.tags.includes(b)).length;
    // Nearest first, nudged by what you've taught it. Places Gemini suggested that couldn't be
    // confirmed on a map come after confirmed ones nearby: they're the likeliest to be wrong.
    return { place: p, drive, score: drive - affinity(taste, p, drive) * 6 - boost * 5 + (unconfirmed(p) ? 15 : 0) };
  };

  const ranked = matched.map(rank).sort((a, b) => a.score - b.score);
  const inside = ranked.filter((r) => withinLimits(r.place, r.drive, setup));
  const hidden = ranked.filter((r) => !withinLimits(r.place, r.drive, setup));
  return { queue: showHidden ? ranked : inside, hidden, relaxed };
}

export function pickSurprise(opts: {
  places: Place[];
  drives: Record<string, number>;
  setup: TripSetup;
  taste: Taste;
  exclude: Set<string>;
  avoid: string[];
}): Place | null {
  const { places, drives, setup, taste, exclude, avoid } = opts;
  const pool = places.filter(
    (p) => !exclude.has(p.id) && !avoid.includes(p.id) && withinLimits(p, drives[p.id], setup),
  );
  if (!pool.length) return null;
  const kids = setup.toddler || setup.baby;
  const scored = pool
    .map((p) => ({
      p,
      s: p.depth * 2 + affinity(taste, p, drives[p.id]) + (kids ? p.kidFit.score - 2 : 0) + Math.random() * 1.5 - (unconfirmed(p) ? 3 : 0),
    }))
    .sort((a, b) => b.s - a.s);
  return scored[0].p;
}
