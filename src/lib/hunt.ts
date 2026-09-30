"use client";

import { fetchOsmFacts, withFacts } from "./cities";
import type { AppState, City, Place, Stay } from "./types";

export class HuntError extends Error {}

// Asks /api/hunt for real places beyond what's already shown: from "Go hunting",
// or when a typed request isn't covered by the city's list.
export async function huntFor(opts: { city: City; stay: Stay; state: AppState; request: string }): Promise<{ places: Place[]; mode: "search" | "knowledge" }> {
  const { city, stay, state, request } = opts;
  const setup = state.setup!;
  const likedTags = Object.entries(state.taste.tags)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const res = await fetch("/api/hunt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: `${city.name}, ${city.state}`,
      stay: { id: stay.id, name: setup.hotelName || stay.name, lat: stay.lat, lng: stay.lng },
      request,
      crew: [`${setup.adults} adults`, setup.toddler && "a toddler", setup.baby && "a baby"].filter(Boolean).join(", "),
      maxDrive: setup.maxDrive,
      travel: setup.travel ?? "drive",
      maxPrice: setup.maxPrice,
      exclude: city.places.map((p) => p.name),
      liked: likedTags,
    }),
  });
  if (res.status === 429) throw new HuntError("429");
  if (!res.ok) throw new HuntError(String(res.status));
  const data = (await res.json()) as { places: Place[]; mode: "search" | "knowledge" };
  if (!data.places?.length) throw new HuntError("none");
  // OpenStreetMap hours for the finds too, and drop any it says have closed (best effort, ~1s)
  try {
    const facts = await fetchOsmFacts(data.places, AbortSignal.timeout(8000));
    const checked = data.places.map((p) => withFacts(p, facts)).filter((p): p is Place => p !== "closed");
    if (checked.length) data.places = checked;
  } catch {
    /* keep the finds without hours */
  }
  return data;
}
