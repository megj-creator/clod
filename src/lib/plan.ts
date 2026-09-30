import { tripDates, toMinutes, fmtTime } from "./dates";
import { estimateDriveMinutes, formatDrive, milesBetween } from "./geo";
import type { BestTime, City, Place, Stay, TripSetup } from "./types";
import type { Weather } from "./weather";

type Slot = "morning" | "lateMorning" | "lunch" | "napDrive" | "afternoon" | "lateAfternoon" | "sunset" | "dinner" | "evening";

export type PlaceStop = {
  kind: "place";
  place: Place;
  time: number;
  driveFromPrev: number;
  notes: string[];
};
export type NapStop = { kind: "nap"; time: number; end: number; text: string };
export type PlanStop = PlaceStop | NapStop;
export type PlanDay = { date: string; weather: Weather; area: string; stops: PlanStop[]; tip: string };

const PREFS: Record<BestTime, Slot[]> = {
  morning: ["morning", "lateMorning", "afternoon", "lateAfternoon"],
  afternoon: ["afternoon", "lateAfternoon", "lateMorning", "morning"],
  sunset: ["sunset", "lateAfternoon", "evening"],
  dinner: ["dinner", "lunch", "evening"],
  evening: ["evening", "sunset", "dinner"],
  anytime: ["lateMorning", "morning", "afternoon", "lateAfternoon", "lunch"],
};
const RIGIDITY: Record<BestTime, number> = { sunset: 0, dinner: 1, evening: 2, morning: 3, afternoon: 4, anytime: 5 };

// Groups saved places into days by proximity, then fits each day around meals,
// sunset, and the nap window. Deterministic: same inputs → same plan.
export function buildPlan(opts: {
  places: Place[];
  setup: TripSetup;
  stay: Stay;
  city: City;
  forecast: Record<string, Weather>;
}): PlanDay[] {
  const { places, setup, stay, city, forecast } = opts;
  const dates = tripDates(setup.start, setup.end);
  const kids = setup.toddler || setup.baby;
  const tipFor = (i: number) => city.gettingAround[i % Math.max(1, city.gettingAround.length)] ?? "";
  const days: PlanDay[] = dates.map((date, i) => ({ date, weather: forecast[date], area: "", stops: [], tip: tipFor(i) }));
  if (!places.length) return days;

  // 1. How many days to use. Lighter days with little ones.
  const perDay = kids ? 2.5 : 3.5;
  const k = Math.min(dates.length, Math.max(1, Math.ceil(places.length / perDay)));

  // 2. Seed clusters with the places farthest apart, then assign by distance with a cap.
  const loc = (p: Place) => p.location;
  const seeds: Place[] = [];
  const farthestFrom = (pts: { lat: number; lng: number }[]) =>
    places
      .filter((p) => !seeds.includes(p))
      .map((p) => ({ p, d: Math.min(...pts.map((q) => milesBetween(loc(p), q))) }))
      .sort((a, b) => b.d - a.d)[0].p;
  seeds.push(farthestFrom([stay]));
  while (seeds.length < k) seeds.push(farthestFrom(seeds.map(loc)));

  const cap = Math.ceil(places.length / k) + (kids ? 0 : 1);
  const clusters: Place[][] = seeds.map(() => []);
  const order = places
    .map((p) => {
      const ds = seeds.map((s) => milesBetween(loc(p), loc(s)));
      const sorted = [...ds].sort((a, b) => a - b);
      return { p, ds, gap: (sorted[1] ?? 0) - sorted[0] };
    })
    .sort((a, b) => b.gap - a.gap);
  for (const { p, ds } of order) {
    const choice = ds
      .map((d, i) => ({ d, i }))
      .sort((a, b) => a.d - b.d)
      .find(({ i }) => clusters[i].length < cap) ?? { i: ds.indexOf(Math.min(...ds)) };
    clusters[choice.i].push(p);
  }

  // 3. Spread busy days across the trip; the rainy day gets the most indoor cluster.
  const idx = k === 1 ? [0] : Array.from({ length: k }, (_, i) => Math.round((i * (dates.length - 1)) / (k - 1)));
  const byNearness = [...clusters].sort((a, b) => avgMiles(a, stay) - avgMiles(b, stay));
  const rainyIdx = idx.find((i) => forecast[dates[i]]?.kind === "rain");
  if (rainyIdx !== undefined) {
    const indoorMost = [...byNearness].sort((a, b) => indoorShare(b) - indoorShare(a))[0];
    byNearness.splice(byNearness.indexOf(indoorMost), 1);
    const rest = idx.filter((i) => i !== rainyIdx);
    days[rainyIdx].stops = scheduleDay(indoorMost);
    days[rainyIdx].area = areaName(indoorMost);
    rest.forEach((i, n) => {
      days[i].stops = scheduleDay(byNearness[n]);
      days[i].area = areaName(byNearness[n]);
    });
  } else {
    idx.forEach((i, n) => {
      days[i].stops = scheduleDay(byNearness[n]);
      days[i].area = areaName(byNearness[n]);
    });
  }

  return days;

  // ── helpers ──
  function scheduleDay(group: Place[]): PlanStop[] {
    const napS = toMinutes(setup.napStart);
    const napE = toMinutes(setup.napEnd);
    const sunset = toMinutes(city.sunset);
    const T: Record<Slot, number> = {
      morning: kids ? 540 : 570,
      lateMorning: kids ? 645 : 660,
      lunch: kids ? 705 : 750,
      napDrive: napS,
      afternoon: kids ? napE + 30 : 840,
      lateAfternoon: kids ? napE + 105 : 960,
      sunset: sunset - 40,
      dinner: kids ? 1050 : 1155,
      evening: kids ? 1140 : 1260,
    };
    const used = new Set<Slot>();
    const stops: PlaceStop[] = [];
    let napInCar = false;

    const sorted = [...group].sort((a, b) => RIGIDITY[a.bestTime] - RIGIDITY[b.bestTime]);
    for (const p of sorted) {
      const fromStay = estimateDriveMinutes(stay, p.location);
      const notes: string[] = [];
      let time: number;

      const flexible = ["morning", "afternoon", "anytime"].includes(p.bestTime);
      if (kids && fromStay > 35 && flexible && !used.has("napDrive")) {
        used.add("napDrive");
        napInCar = true;
        time = napS + fromStay;
        notes.push(`Leave at ${fmtTime(napS)}. The ${formatDrive(fromStay)} drive doubles as nap time.`);
      } else {
        const slot =
          PREFS[p.bestTime].find((s) => !used.has(s)) ??
          (["lateAfternoon", "afternoon", "lateMorning", "morning", "lunch", "evening"] as Slot[]).find((s) => !used.has(s)) ??
          "evening";
        used.add(slot);
        time = T[slot];
      }
      if (kids && p.kidFit.score === 1) notes.push("Best for grown-ups. Go early, or take turns.");
      if (kids && time >= 1170) notes.push("Late for little ones.");
      stops.push({ kind: "place", place: p, time, driveFromPrev: 0, notes });
    }

    stops.sort((a, b) => a.time - b.time);
    stops.forEach((s, i) => {
      const prev = i === 0 ? stay : stops[i - 1].place.location;
      s.driveFromPrev = estimateDriveMinutes(prev, s.place.location);
    });

    const all: PlanStop[] = [...stops];
    if (kids && !napInCar) {
      const before = stops.filter((s) => s.time < napS).pop();
      const back = before ? estimateDriveMinutes(before.place.location, stay) : 0;
      all.push({
        kind: "nap",
        time: napS,
        end: napE,
        text: before
          ? `Head back to ${setup.hotelName || stay.name} (${formatDrive(back)}), or try a stroller or car nap.`
          : "Protected quiet time back at your stay.",
      });
      all.sort((a, b) => a.time - b.time);
    }
    return all;
  }
}

function avgMiles(group: Place[], stay: Stay) {
  return group.reduce((s, p) => s + milesBetween(p.location, stay), 0) / Math.max(1, group.length);
}
function indoorShare(group: Place[]) {
  return group.filter((p) => p.indoor).length / Math.max(1, group.length);
}
function areaName(group: Place[]) {
  const counts: Record<string, number> = {};
  for (const p of group) {
    const n = p.neighborhood.split(" · ")[0];
    counts[n] = (counts[n] ?? 0) + 1;
  }
  const names = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return names.slice(0, 2).join(" & ");
}
