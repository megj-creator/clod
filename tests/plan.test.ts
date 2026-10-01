import { describe, expect, it } from "vitest";
import { buildPlan, type PlaceStop } from "@/lib/plan";
import { sampleForecast } from "@/lib/weather";
import { tripDates } from "@/lib/dates";
import { city, place, setup, stay } from "./fixtures";

const plan = (places: ReturnType<typeof place>[], over: Parameters<typeof setup>[0] = {}, extra: Partial<Parameters<typeof buildPlan>[0]> = {}) => {
  const s = setup(over);
  return buildPlan({ places, setup: s, stay, city: city(places), forecast: sampleForecast(tripDates(s.start, s.end)), ...extra });
};
const placeStops = (days: ReturnType<typeof buildPlan>) => days.flatMap((d) => d.stops.filter((s): s is PlaceStop => s.kind === "place"));

describe("day planner", () => {
  it("never starts a stop before the previous one is over plus travel time", () => {
    // The real bug: a 2.5-hour aquarium at 9:30, then the next stop at 11:00
    const places = [
      place({ id: "aquarium", bestTime: "morning", durationMin: 150, indoor: true }),
      place({ id: "museum", bestTime: "morning", durationMin: 180, lat: 38.711, indoor: true }),
      place({ id: "park", bestTime: "afternoon", durationMin: 90, lat: 38.712 }),
    ];
    const days = plan(places, { start: "2026-10-12", end: "2026-10-12" });
    const stops = placeStops(days).sort((a, b) => a.time - b.time);
    expect(stops.length).toBe(3);
    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1];
      expect(stops[i].time).toBeGreaterThanOrEqual(prev.time + prev.place.durationMin + stops[i].driveFromPrev);
    }
  });

  it("doesn't put a place on a day it's closed when another day works", () => {
    // Open Tue–Sun only; the trip has a Monday and a Tuesday
    const closedMondays = place({ id: "closed-mon", openDays: [0, 2, 3, 4, 5, 6] });
    const days = plan([closedMondays], { start: "2026-10-12", end: "2026-10-13" });
    const day = days.find((d) => d.stops.length)!;
    expect(new Date(`${day.date}T12:00:00`).getDay()).not.toBe(1);
  });

  it("only suggests a car nap when there's a car", () => {
    const farAway = place({ id: "far", lat: 38.95, lng: -9.4, bestTime: "afternoon", driveFrom: { center: 50 } });
    const kids = { toddler: true, start: "2026-10-12", end: "2026-10-12" };
    const byCar = placeStops(plan([farAway], kids));
    expect(byCar[0].notes.join(" ")).toMatch(/doubles as nap time/);
    const onFoot = placeStops(plan([farAway], { ...kids, travel: "walk" }, { ctx: { mode: "walk" } }));
    expect(onFoot[0].notes.join(" ")).not.toMatch(/nap/);
  });

  it("times sunset plans to the destination's actual sunset", () => {
    const viewpoint = place({ id: "view", bestTime: "sunset" });
    const days = plan([viewpoint], { start: "2026-10-12", end: "2026-10-12" }, { sunsets: { "2026-10-12": "19:10" } });
    expect(placeStops(days)[0].time).toBe(19 * 60 + 10 - 40); // 40 minutes before
  });
});
