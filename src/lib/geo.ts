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

export type DriveInfo = { min: number; real: boolean };

// Real road time from a stay when we have one (drives.json or a live find), else an estimate
export function driveFromStay(city: City, stay: { id: string } & LatLng, p: Place): DriveInfo {
  const real = city.drives?.stays[stay.id]?.[p.id] ?? p.driveFrom?.[stay.id];
  return real != null ? { min: real, real: true } : { min: estimateDriveMinutes(stay, p.location), real: false };
}

// Place-to-place, for the day planner
export function driveBetween(city: City | undefined, a: { id?: string } & LatLng, b: Place): number {
  const real = a.id ? city?.drives?.between[a.id]?.[b.id] : undefined;
  return real ?? estimateDriveMinutes(a, b.location);
}

export function formatDrive(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
