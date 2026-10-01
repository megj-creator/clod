import { describe, expect, it } from "vitest";
import { decodeTrip, encodeTrip, slimPlace, tripFromState, type SharedTrip } from "@/lib/share";
import { initialState } from "@/lib/store";
import type { Place } from "@/lib/types";
import { city, place, setup } from "./fixtures";

const live = { foundAt: "2026-09-30", mode: "knowledge" as const, origin: "hunt" as const, sources: [{ title: "x", url: "https://x" }] };

describe("shared trip links", () => {
  it("round-trips a trip through the link", async () => {
    const p = place({ id: "cafe", name: "Café Ñoño", whyFound: "Great pastéis — trust me", live });
    const trip: SharedTrip = { v: 1, city: "Lisbon", name: "Lisbon", setup: { ...setup(), cityId: undefined } as never, saved: ["cafe"], planned: true, places: [slimPlace(p)] };
    const back = await decodeTrip(await encodeTrip(trip));
    expect(back?.places[0].name).toBe("Café Ñoño"); // accents survive
    expect(back?.places[0].whyFound).toBe("Great pastéis — trust me");
    expect(back?.planned).toBe(true);
    expect(back?.setup.start).toBe("2026-10-12");
  });

  it("uses only URL-safe characters", async () => {
    const trip: SharedTrip = { v: 1, city: "Kyoto", name: "Kyoto", setup: setup() as never, saved: [], planned: false, places: [] };
    expect(await encodeTrip(trip)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects broken links instead of crashing", async () => {
    expect(await decodeTrip("not-a-real-trip-code")).toBeNull();
    expect(await decodeTrip("")).toBeNull();
  });

  it("keeps the link small: drops source lists, keeps what the trip needs", () => {
    const slim = slimPlace(place({ id: "p", live, photos: [1, 2, 3].map((i) => ({ src: `s${i}`, credit: "", license: "", source: "" })) }));
    expect(slim.live?.sources).toEqual([]);
    expect(slim.photos.length).toBe(1);
    expect(slim.location).toBeDefined();
  });

  it("carries searched-city and hunted places, but not the featured city's (found again by id)", () => {
    const curated = place({ id: "husk" });
    const hunted = place({ id: "live-x", live });
    const byId: Record<string, Place> = { husk: curated, "live-x": hunted };
    const state = { ...initialState(), setup: setup({ cityId: "testville" }), saved: ["husk", "live-x"], planFor: ["husk", "live-x"] };
    const trip = tripFromState(state, city([curated]), byId)!;
    expect(trip.places.map((p) => p.id)).toEqual(["live-x"]);
    expect(trip.saved).toEqual(["husk", "live-x"]);
    expect(trip.planned).toBe(true);
    // Personal things stay private
    expect(JSON.stringify(trip)).not.toMatch(/taste|feedback|passed/);
  });
});
