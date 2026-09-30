import type { City, Place } from "./types";

type LatLng = { lat: number; lng: number };

export function milesBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

// ESTIMATE ONLY: straight-line distance, padded for real roads and typical speeds.
// Used only when a real road time isn't available.
export function estimateDriveMinutes(a: LatLng, b: LatLng): number {
  const road = milesBetween(a, b) * 1.25;
  const mph = road < 3 ? 16 : road < 10 ? 26 : road < 25 ? 36 : 55;
  return Math.max(4, Math.round((road / mph) * 60 + 3));
}

// How the traveler gets around, plus real road times from a hotel they typed in (looked up on the map)
export type TravelCtx = { mode: "drive" | "walk"; hotelDrives?: Record<string, number> };
export type How = "drive" | "walk" | "transit";
export type DriveInfo = { min: number; real: boolean; how: How };

// ESTIMATE: on foot (~3 mph on real streets, which wind ~30% more than a straight line),
// or, past a ~25-minute walk, transit: ~10 minutes to reach a stop and wait, then ~12 mph door to door.
export function walkOrTransit(a: LatLng, b: LatLng): { min: number; how: How } {
  const miles = milesBetween(a, b) * 1.3;
  const walk = Math.max(2, Math.round((miles / 3) * 60));
  if (walk <= 25) return { min: walk, how: "walk" };
  return { min: Math.min(walk, Math.round(10 + (miles / 12) * 60)), how: "transit" };
}

// Real road time from a stay when we have one (drives.json, a live find, or a looked-up hotel), else an estimate
export function driveFromStay(city: City, stay: { id: string } & LatLng, p: Place, ctx?: TravelCtx): DriveInfo {
  if (ctx?.mode === "walk") return { ...walkOrTransit(stay, p.location), real: false };
  const real = ctx?.hotelDrives?.[p.id] ?? city.drives?.stays[stay.id]?.[p.id] ?? p.driveFrom?.[stay.id];
  return real != null ? { min: real, real: true, how: "drive" } : { min: estimateDriveMinutes(stay, p.location), real: false, how: "drive" };
}

// Place-to-place, for the day planner
export function driveBetween(city: City | undefined, a: { id?: string } & LatLng, b: Place, ctx?: TravelCtx): number {
  if (ctx?.mode === "walk") return walkOrTransit(a, b.location).min;
  const real = a.id ? city?.drives?.between[a.id]?.[b.id] : undefined;
  return real ?? estimateDriveMinutes(a, b.location);
}

// For a bare number of minutes (e.g. a planner leg): which way of getting there it means
export const howFor = (min: number, ctx?: TravelCtx): How => (ctx?.mode !== "walk" ? "drive" : min <= 25 ? "walk" : "transit");

// "12 min walk", "35 min by transit", "18 min" (driving is the default and needs no word)
export function formatTravel(min: number, how: How): string {
  return how === "walk" ? `${formatDrive(min)} walk` : how === "transit" ? `${formatDrive(min)} by transit` : formatDrive(min);
}

export function formatDrive(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
