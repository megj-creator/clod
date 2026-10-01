// A whole trip in a link: destination, dates, where you're staying, how you get around, and the saved
// places themselves (a compact copy, since a searched city's list can change after a day and hunted
// finds live only on the sharer's phone). Compressed with the browser's built-in deflate, so a
// 6-place trip stays a few kilobytes. Personal things (taste profile, ratings, passes) stay private.

import type { AppState, City, Place, TripSetup } from "./types";

export type SharedTrip = {
  v: 1;
  city: string; // the search that finds the destination again ("Lisbon"), or the featured city's id
  name: string; // "Lisbon", for the "open this trip?" prompt before the city has loaded
  setup: Omit<TripSetup, "cityId">;
  saved: string[];
  planned: boolean;
  places: Place[]; // slim copies of saved places that can't be looked up by id
};

// Keeps what cards, the detail sheet, and the planner need; drops long source lists and duplicates
export function slimPlace(p: Place): Place {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    tagline: p.tagline,
    neighborhood: p.neighborhood,
    depth: p.depth,
    tags: p.tags.slice(0, 6),
    moods: p.moods,
    location: p.location,
    price: p.price,
    bestTime: p.bestTime,
    durationMin: p.durationMin,
    indoor: p.indoor,
    photos: p.photos.slice(0, 1),
    whyFound: p.whyFound,
    insiderTip: p.insiderTip,
    localsSay: { text: p.localsSay.text, sourced: p.localsSay.sourced },
    realityCheck: {
      hours: p.realityCheck.hours,
      officialUrl: p.realityCheck.officialUrl,
      lastChecked: p.realityCheck.lastChecked,
      warnings: (p.realityCheck.warnings ?? []).slice(0, 2),
      ...(p.realityCheck.osm ? { osm: p.realityCheck.osm } : {}),
    },
    rainPlan: { text: p.rainPlan.text },
    booking: { best: p.booking.best, lastChecked: p.booking.lastChecked },
    hypeCheck: p.hypeCheck,
    kidFit: p.kidFit,
    ...(p.live ? { live: { foundAt: p.live.foundAt, mode: p.live.mode, origin: p.live.origin, sources: [] } } : {}),
    ...(p.driveFrom ? { driveFrom: p.driveFrom } : {}),
    ...(p.openDays ? { openDays: p.openDays } : {}),
  };
}

export function tripFromState(state: AppState, city: City, byId: Record<string, Place>): SharedTrip | null {
  if (!state.setup) return null;
  const { cityId: _omit, ...setup } = state.setup;
  const saved = state.saved.filter((id) => byId[id]);
  return {
    v: 1,
    city: city.generated ? city.generated.query : city.id,
    name: city.name,
    setup,
    saved,
    planned: !!state.planFor,
    // The featured city's hand-checked places are found again by id; everything else travels in the link
    places: saved.map((id) => byId[id]).filter((p) => p.live || city.generated).map(slimPlace),
  };
}

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeTrip(trip: SharedTrip): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(trip));
  return toB64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeTrip(code: string): Promise<SharedTrip | null> {
  try {
    const json = await pipe(fromB64Url(code), new DecompressionStream("deflate-raw"));
    const t = JSON.parse(new TextDecoder().decode(json)) as SharedTrip;
    if (t?.v !== 1 || typeof t.city !== "string" || !t.setup?.start || !Array.isArray(t.saved) || !Array.isArray(t.places)) return null;
    t.name = String(t.name || t.city).slice(0, 40);
    // Only well-formed places, and only saves that point at something
    t.places = t.places.filter((p) => p && typeof p.id === "string" && p.name && Number.isFinite(p.location?.lat) && Number.isFinite(p.location?.lng));
    return t;
  } catch {
    return null;
  }
}

// After "#", so the trip never travels to the server (no URL length limits there, nothing logged)
export async function tripLink(trip: SharedTrip): Promise<string> {
  return `${window.location.origin}/#trip=${await encodeTrip(trip)}`;
}

// The shared trip in this page's address, if any
// (anything after "trip=", even damaged, so a mangled link gets a "looks broken" message, not silence)
export const tripCodeInUrl = () => window.location.hash.match(/[#&]trip=([^&]*)/)?.[1] ?? null;
