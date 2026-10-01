import { describe, expect, it } from "vitest";
import { driveBetween, driveFromStay, formatTravel, howFor, walkOrTransit } from "@/lib/geo";
import { sunsetLocal } from "@/lib/sun";
import { city, place, stay } from "./fixtures";

const minutes = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : NaN);

describe("sunset", () => {
  it("matches published times within a few minutes", () => {
    // Open-Meteo: Lisbon 2026-10-03 sunset 19:16
    expect(Math.abs(minutes(sunsetLocal("2026-10-03", 38.7223, -9.1393, "Europe/Lisbon")) - minutes("19:16"))).toBeLessThanOrEqual(3);
    // Edinburgh midsummer, a little after 22:00
    expect(Math.abs(minutes(sunsetLocal("2026-06-21", 55.9533, -3.1883, "Europe/London")) - minutes("22:02"))).toBeLessThanOrEqual(5);
  });
  it("handles daylight saving through the time zone", () => {
    // Same place, either side of the US clock change: about an hour apart, not two minutes
    const before = minutes(sunsetLocal("2026-10-31", 32.7765, -79.9311, "America/New_York"));
    const after = minutes(sunsetLocal("2026-11-02", 32.7765, -79.9311, "America/New_York"));
    expect(before - after).toBeGreaterThan(55);
  });
  it("returns null in polar night", () => {
    expect(sunsetLocal("2026-12-21", 69.6492, 18.9553, "Europe/Oslo")).toBeNull();
  });
});

describe("getting around", () => {
  const near = { lat: 38.712, lng: -9.14 }; // ~0.15 mi
  const far = { lat: 38.77, lng: -9.1 }; // ~4.6 mi

  it("walks short hops and takes transit for long ones", () => {
    expect(walkOrTransit(stay, near).how).toBe("walk");
    const long = walkOrTransit(stay, far);
    expect(long.how).toBe("transit");
    expect(long.min).toBeLessThan(Math.round(((4.6 * 1.3) / 3) * 60)); // faster than walking it
  });

  it("uses real road times by car, best source first", () => {
    const p = place({ id: "p", lat: far.lat, lng: far.lng, driveFrom: { center: 22 } });
    expect(driveFromStay(city(), stay, p)).toEqual({ min: 22, real: true, how: "drive" });
    // A looked-up hotel's own road times win
    expect(driveFromStay(city(), stay, p, { mode: "drive", hotelDrives: { p: 17 } }).min).toBe(17);
    // On foot, road times don't apply
    expect(driveFromStay(city(), stay, p, { mode: "walk" }).how).toBe("transit");
    expect(driveBetween(city(), stay, p, { mode: "walk" })).toBe(walkOrTransit(stay, far).min);
  });

  it("labels times the way people say them", () => {
    expect(formatTravel(12, "walk")).toBe("12 min walk");
    expect(formatTravel(75, "transit")).toBe("1 hr 15 min by transit");
    expect(formatTravel(18, "drive")).toBe("18 min");
    expect(howFor(20, { mode: "walk" })).toBe("walk");
    expect(howFor(40, { mode: "walk" })).toBe("transit");
    expect(howFor(40)).toBe("drive");
  });
});
