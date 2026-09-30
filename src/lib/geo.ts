type LatLng = { lat: number; lng: number };

export function milesBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

// ESTIMATE ONLY: straight-line distance, padded for real roads and typical speeds.
// This is the piece we replace first with a real routing service.
export function estimateDriveMinutes(a: LatLng, b: LatLng): number {
  const road = milesBetween(a, b) * 1.25;
  const mph = road < 3 ? 16 : road < 10 ? 26 : road < 25 ? 36 : 55;
  return Math.max(4, Math.round((road / mph) * 60 + 3));
}

export function formatDrive(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
